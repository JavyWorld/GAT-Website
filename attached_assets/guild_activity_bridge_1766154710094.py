#!/usr/bin/env python3
"""
Guild Activity Tracker Bridge - Versión 1.70 (IRONCLAD PROTOCOL)
- FUENTE ÚNICA: Solo usa 'master_roster' del Addon. Ignora chat histórico para membresía.
- PURGA AGRESIVA: Antes de escanear, elimina del Sheet a cualquiera que no esté en el Master Roster.
- SEGURIDAD: Usa 'requests params' para eliminar Errores 400 por caracteres extraños.
- ORDEN: 1. Leer Master -> 2. Depurar Sheet -> 3. Escanear IO.
"""
import os
import time
import logging
import re
import requests
import sys
from datetime import datetime

import gspread
from oauth2client.service_account import ServiceAccountCredentials
from dotenv import load_dotenv
import colorama
from colorama import Fore, Style
import slpp

# Inicializar colores y logging
colorama.init(autoreset=True)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(message)s', datefmt='%H:%M:%S')
logger = logging.getLogger(__name__)

class Config:
    def __init__(self):
        load_dotenv()
        self.credentials_path = os.getenv('GOOGLE_SHEETS_CREDENTIALS', 'credentials.json')
        self.sheet_name = os.getenv('GOOGLE_SHEET_NAME', 'Guild Activity Tracker')
        self.worksheet_dashboard = "Dashboard"
        self.worksheet_members = os.getenv('GOOGLE_SHEET_WORKSHEET', 'Members')
        self.worksheet_stats = "Activity Logs"
        self.worksheet_mythic = "M+ Score"
        
        raw_path = os.getenv('WOW_ADDON_PATH', '')
        self.wow_addon_path = os.path.normpath(os.path.expandvars(raw_path))
        
        # Tiempos
        self.poll_interval = 1         
        self.safety_start_delay = 60   
        self.rio_batch_size = 50       
        self.rio_batch_delay = 60      
        self.rio_cycle_delay = 300     
        
        self.default_realm = "Quel'Thalas" 
        self.region = 'us'
        
        self._validate()
    
    def _validate(self):
        if not self.wow_addon_path or self.wow_addon_path == '.':
            raise ValueError("Error: WOW_ADDON_PATH no configurado.")
        if not os.path.isfile(self.credentials_path):
            raise FileNotFoundError("Error: credentials.json no encontrado.")

class GuildActivityBridge:
    def __init__(self, config: Config):
        self.config = config
        self.lua_parser = slpp.SLPP()
        self.last_mtime = 0
        self.session = requests.Session()
        
        # Estado
        self.master_roster_list = [] # La lista sagrada
        self.rio_queue = []
        self.total_batches = 0
        self.current_batch_index = 0
        self.cycles_completed = 0
        self.current_status = "Iniciando..."
        self.next_rio_event_time = time.time() + self.config.safety_start_delay
        
        try:
            scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
            creds = ServiceAccountCredentials.from_json_keyfile_name(self.config.credentials_path, scope)
            self.gc = gspread.authorize(creds)
        except Exception as e:
            logger.error(f"{Fore.RED}Error conectando a Google: {e}")
            raise

    def start(self):
        os.system('cls' if os.name == 'nt' else 'clear')
        print(f"{Fore.GREEN}{Style.BRIGHT}=== GUILD BRIDGE V1.70 (IRONCLAD) ===")
        print(f"{Fore.YELLOW}Modo Seguridad: Esperando 1 minuto...")
        self.current_status = "Buffer de Seguridad"

        while True:
            try:
                if os.path.isfile(self.config.wow_addon_path):
                    current_mtime = os.path.getmtime(self.config.wow_addon_path)
                    if self.last_mtime == 0 or current_mtime != self.last_mtime:
                        sys.stdout.write("\r" + " " * 80 + "\r") 
                        if self.last_mtime != 0: logger.info(f"{Fore.CYAN}Cambio en Addon detectado.")
                        self.process_file(current_mtime)

                self._manage_rio_queue()
                self._print_dashboard()
                time.sleep(self.config.poll_interval)

            except KeyboardInterrupt:
                print(f"\n{Fore.RED}Deteniendo servicio... ¡Nos vemos!")
                break
            except Exception as e:
                sys.stdout.write("\r" + " " * 80 + "\r")
                logger.error(f"Error Loop: {e}")
                time.sleep(5)

    def _print_dashboard(self):
        now = time.time()
        remaining = int(self.next_rio_event_time - now)
        if remaining < 0: remaining = 0
        mins, secs = divmod(remaining, 60)
        timer_str = f"{mins:02d}m {secs:02d}s"
        
        timer_color = Fore.WHITE
        if remaining < 10: timer_color = Fore.RED
        elif remaining < 60: timer_color = Fore.YELLOW
        
        status_line = (
            f"\r{Style.BRIGHT}{Fore.BLUE}[ESTADO]{Style.RESET_ALL} {self.current_status} | "
            f"{Fore.MAGENTA}Ciclo #{self.cycles_completed + 1}{Style.RESET_ALL} | "
            f"Timer: {timer_color}{timer_str}{Style.RESET_ALL}    "
        )
        sys.stdout.write(status_line)
        sys.stdout.flush()

    def _get_canonical_name(self, name_raw):
        if not name_raw: return None
        if '-' in name_raw: return name_raw
        return f"{name_raw}-{self.config.default_realm}"

    def process_file(self, mtime):
        self.last_mtime = mtime
        try:
            with open(self.config.wow_addon_path, 'r', encoding='utf-8', errors='replace') as f:
                content = f.read()
            if not content.strip(): return
            
            clean = re.sub(r'--.*$', '', content[content.find('{'):], flags=re.MULTILINE)
            data = self.lua_parser.decode(clean)
            if not isinstance(data, dict): return

            self._ensure_sheets()

            # =====================================================
            # 1. CARGA DE LA LISTA MAESTRA (FUENTE ÚNICA)
            # =====================================================
            self.master_roster_list = []
            
            # Solo leemos 'master_roster'. Ignoramos 'data' y 'roster' viejo para membresía.
            if 'master_roster' in data and isinstance(data['master_roster'], dict):
                for k in data['master_roster'].keys():
                    canon = self._get_canonical_name(k)
                    if canon: self.master_roster_list.append(canon)
                
                # Ordenamos
                self.master_roster_list.sort()
                
                logger.info(f"Master Roster cargado: {len(self.master_roster_list)} miembros oficiales.")
                if len(self.master_roster_list) > 1000:
                    logger.warning(f"{Fore.RED}ALERTA: El roster supera los 1000 miembros ({len(self.master_roster_list)}). Revisar duplicados en WoW.")

                # =====================================================
                # 2. EJECUCIÓN DE LA PURGA (THE PURGE)
                # =====================================================
                # Inmediatamente limpiamos el Sheet de cualquiera que no esté en la lista maestra
                if len(self.master_roster_list) > 0:
                    self._prune_leavers(set(self.master_roster_list))

            # 3. ACTUALIZACIÓN DE DATOS DE CHAT (Solo datos, no añade miembros fantasma)
            if 'data' in data:
                self._sync_members_data_only(data['data'])

            # 4. STATS SYNC
            if 'stats' in data:
                stats_raw = data['stats']
                stats_list = []
                if isinstance(stats_raw, dict): stats_list = list(stats_raw.values())
                elif isinstance(stats_raw, list): stats_list = stats_raw
                stats_list = [s for s in stats_list if isinstance(s, dict)]
                
                self._sync_stats(stats_list)
                self._update_dashboard_tab(stats_list, len(self.master_roster_list))

        except Exception as e:
            logger.error(f"Error parsing LUA: {e}")

    # =========================================================================
    # PROTOCOLO DE DEPURACIÓN (THE PURGE)
    # =========================================================================
    def _prune_leavers(self, valid_names_set):
        """Elimina filas de Members y M+ Score si el nombre no está en el Master Roster"""
        try:
            sh = self.gc.open(self.config.sheet_name)
            targets = [
                (self.config.worksheet_members, 0), # Nombre en col A
                (self.config.worksheet_mythic, 1)   # Nombre en col B
            ]

            for sheet_name, name_col_idx in targets:
                try:
                    ws = sh.worksheet(sheet_name)
                    rows = ws.get_all_values()
                    if not rows: continue

                    rows_to_delete = []
                    # Empezamos en 1 (saltar header)
                    for idx, row in enumerate(rows):
                        if idx == 0: continue 
                        if len(row) > name_col_idx:
                            sheet_name_raw = row[name_col_idx]
                            canon_sheet = self._get_canonical_name(sheet_name_raw)
                            
                            # Si el nombre del sheet NO está en la lista maestra -> DELETE
                            if canon_sheet and canon_sheet not in valid_names_set:
                                rows_to_delete.append(idx + 1)

                    if rows_to_delete:
                        # Borrar de abajo hacia arriba siempre
                        rows_to_delete.sort(reverse=True)
                        logger.info(f"{Fore.YELLOW}Depurando hoja '{sheet_name}'... Eliminando {len(rows_to_delete)} ex-miembros.")
                        
                        # Batch delete si es posible o uno por uno
                        for r_idx in rows_to_delete:
                            ws.delete_rows(r_idx)
                            time.sleep(0.2) # Pequeña pausa
                        
                        logger.info(f"{Fore.GREEN}Depuración completada en {sheet_name}.")
                except: pass
        except Exception as e:
            logger.error(f"Error en Purge: {e}")

    # =========================================================================
    # GESTIÓN RAIDER.IO
    # =========================================================================
    def _manage_rio_queue(self):
        now = time.time()
        if now < self.next_rio_event_time: return

        # Si no hay lista maestra, no hacemos nada (seguridad)
        if not self.master_roster_list:
            self.current_status = "Esperando Master Roster..."
            return

        # 1. INICIAR NUEVO CICLO
        if not self.rio_queue:
            sys.stdout.write("\r" + " " * 80 + "\r")
            logger.info(f"{Fore.MAGENTA}>>> CICLO #{self.cycles_completed + 1}: Escaneando {len(self.master_roster_list)} miembros oficiales.")
            
            chunk_size = self.config.rio_batch_size
            for i in range(0, len(self.master_roster_list), chunk_size):
                batch = self.master_roster_list[i:i + chunk_size]
                self.rio_queue.append(batch)
            
            self.total_batches = len(self.rio_queue)
            self.current_batch_index = 0
            self.current_status = "Preparando Rondas..."

        # 2. PROCESAR LOTE
        if self.rio_queue:
            self.current_batch_index += 1
            batch = self.rio_queue.pop(0)
            remaining = len(self.rio_queue)
            
            sys.stdout.write("\r" + " " * 80 + "\r")
            logger.info(f"{Fore.YELLOW}>>> Lote {self.current_batch_index}/{self.total_batches} ({len(batch)} pax)...")
            
            self._sync_mythic_raiderio(batch)
            
            if remaining > 0:
                self.next_rio_event_time = now + self.config.rio_batch_delay
                self.current_status = f"Esperando Lote {self.current_batch_index + 1}..."
            else:
                self.cycles_completed += 1
                self.next_rio_event_time = now + self.config.rio_cycle_delay
                self.current_status = "Descanso (5min)"
                logger.info(f"{Fore.GREEN}Ciclo Completado. Descanso de 5 min.")

    # =========================================================================
    # RAIDER.IO API (ROBUST PARAMS)
    # =========================================================================
    def _slugify_realm(self, realm):
        if not realm: return ""
        realm = realm.replace("'", "").replace('"', "").replace(" ", "-")
        return realm.lower()

    def _fetch_character_data(self, name_realm):
        try:
            parts = name_realm.split('-', 1)
            if len(parts) != 2: return "INVALID_FORMAT"
            
            name = parts[0]
            raw_realm = parts[1]
            realm_slug = self._slugify_realm(raw_realm)

            url = f"https://raider.io/api/v1/characters/profile"
            # PARAMS AUTOMÁTICOS: Requests maneja acentos y caracteres raros aquí
            params = {
                'region': self.config.region,
                'realm': realm_slug,
                'name': name,
                'fields': 'mythic_plus_scores_by_season:current,mythic_plus_best_runs'
            }
            
            response = self.session.get(url, params=params, timeout=5)
            
            if response.status_code == 200: return response.json()
            elif response.status_code == 400: return "400"
            elif response.status_code == 404: return "404"
            else: return f"HTTP_{response.status_code}"
            
        except Exception as e:
            return "EXCEPTION"

    def _sync_mythic_raiderio(self, player_list):
        try:
            sh = self.gc.open(self.config.sheet_name)
            ws = sh.worksheet(self.config.worksheet_mythic)
            existing_data = ws.get_all_values()
            existing_map = {}
            headers = ["Avatar", "Jugador", "Rol", "Raza", "Clase", "Spec", "M+ Score", "Best Key", "Logros", "Last Update", "Profile URL"]
            
            if not existing_data:
                ws.append_row(headers)
                ws.format("A1:K1", {"textFormat": {"bold": True}})
                existing_data = [headers]

            col_jugador_idx = 1
            for idx, row in enumerate(existing_data):
                if idx > 0 and len(row) > col_jugador_idx: existing_map[row[col_jugador_idx]] = idx + 1
            
            updates = []
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
            next_row = len(existing_data) + 1
            
            stats = {"ok": 0, "cero": 0, "404": 0, "400": 0, "err": 0}
            
            for i, p_full in enumerate(player_list):
                time.sleep(0.2) 
                if i % 10 == 0:
                    sys.stdout.write(f"\r   ... Escaneando {i}/{len(player_list)} ...")
                    sys.stdout.flush()

                rio = self._fetch_character_data(p_full)
                
                if rio == "404": stats["404"] += 1
                elif rio == "400": stats["400"] += 1
                elif isinstance(rio, str): stats["err"] += 1
                
                elif isinstance(rio, dict):
                    score = 0.0
                    try:
                        scores = rio.get('mythic_plus_scores_by_season', [])
                        if scores: score = scores[0].get('scores', {}).get('all', 0.0)
                    except: pass
                    
                    if score > 0: stats["ok"] += 1
                    else: stats["cero"] += 1

                    # DATA EXTRACTION (Siempre, incluso si es 0)
                    p_class = rio.get('class', 'Unknown')
                    p_spec = rio.get('active_spec_name', 'N/A')
                    p_role = rio.get('active_role', 'N/A')
                    p_race = rio.get('race', 'N/A')
                    p_achiev = rio.get('achievement_points', 0)
                    p_url = rio.get('profile_url', '')
                    p_thumb = rio.get('thumbnail_url', '')
                    avatar_formula = f'=IMAGE("{p_thumb}")' if p_thumb else ""
                    
                    best_run = "0"
                    try:
                        runs = rio.get('mythic_plus_best_runs', [])
                        if runs: 
                            run_str = f"+{runs[0].get('mythic_level', 0)} {runs[0].get('short_name', '')}"
                            best_run = f"'{run_str}"
                    except: pass

                    row_vals = [avatar_formula, p_full, p_role, p_race, p_class, p_spec, score, best_run, p_achiev, timestamp, p_url]
                    
                    if p_full in existing_map:
                        r_idx = existing_map[p_full]
                        updates.append({'range': f"A{r_idx}:K{r_idx}", 'values': [row_vals]})
                    else:
                        updates.append({'range': f"A{next_row}:K{next_row}", 'values': [row_vals]})
                        next_row += 1

            sys.stdout.write("\r" + " " * 60 + "\r")
            
            total = stats['ok'] + stats['cero'] + stats['404'] + stats['400'] + stats['err']
            logger.info(f" > RESUMEN LOTE: {total} procesados.")
            logger.info(f"   [>0: {stats['ok']}] [0: {stats['cero']}] [404: {stats['404']}] [400: {stats['400']}] [Err: {stats['err']}]")

            if updates:
                ws.batch_update(updates, value_input_option='USER_ENTERED')
                logger.info(f" > Sheets Update: {len(updates)} filas.")

        except Exception as e:
            logger.error(f"Error Sync RaiderIO: {e}")

    # =========================================================================
    # SYNC DASHBOARD & BASIC (MEMBERS)
    # =========================================================================
    def _update_dashboard_tab(self, stats_list, members_count):
        try:
            sh = self.gc.open(self.config.sheet_name)
            try: ws = sh.worksheet(self.config.worksheet_dashboard)
            except: ws = sh.add_worksheet(self.config.worksheet_dashboard, 100, 26)

            heatmap = [[ [0,0] for _ in range(24) ] for _ in range(7)]
            peak_online = 0
            current_online = 0
            sorted_stats = sorted(stats_list, key=lambda x: x.get('ts', 0))
            if sorted_stats: current_online = sorted_stats[-1].get('onlineCount', 0)
            
            for snap in sorted_stats:
                count = snap.get('onlineCount', 0)
                if count > peak_online: peak_online = count
                ts = snap.get('ts', 0)
                if ts > 0:
                    dt = datetime.fromtimestamp(ts)
                    heatmap[dt.weekday()][dt.hour][0] += count
                    heatmap[dt.weekday()][dt.hour][1] += 1

            final_grid = []
            for d in range(7):
                row_vals = []
                for h in range(24):
                    total, samples = heatmap[d][h]
                    avg = int(round(total / samples)) if samples > 0 else 0
                    row_vals.append(avg)
                final_grid.append(row_vals)

            updates = []
            updates.append({'range': 'B2', 'values': [['PEAK ONLINE RECORD']]})
            updates.append({'range': 'B3', 'values': [[peak_online]]})
            updates.append({'range': 'D2', 'values': [['ACTUALMENTE ONLINE']]})
            updates.append({'range': 'D3', 'values': [[current_online]]})
            updates.append({'range': 'F2', 'values': [['MIEMBROS TOTALES']]})
            updates.append({'range': 'F3', 'values': [[members_count]]})
            
            start_row = 6
            updates.append({'range': f'B{start_row}', 'values': [['MAPA DE CONECTIVIDAD (Promedio Online)']]})
            hours_header = [f"{h:02d}:00" for h in range(24)]
            updates.append({'range': f'C{start_row+1}:Z{start_row+1}', 'values': [hours_header]})
            
            days_labels = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
            for i, dname in enumerate(days_labels):
                row_num = start_row + 2 + i
                updates.append({'range': f'B{row_num}', 'values': [[dname]]})
                updates.append({'range': f'C{row_num}:Z{row_num}', 'values': [final_grid[i]]})

            row_spark = start_row + 10
            updates.append({'range': f'B{row_spark}', 'values': [['INTENSIDAD']]})
            spark_formulas = []
            for h in range(24):
                col_sum = sum(final_grid[d][h] for d in range(7))
                spark_formulas.append(f'=SPARKLINE({col_sum}, {{"charttype","bar";"max",{peak_online*7};"color1","#4285F4"}})')
            updates.append({'range': f'C{row_spark}:Z{row_spark}', 'values': [spark_formulas]})

            ws.batch_update(updates, value_input_option='USER_ENTERED')
            ts_str = datetime.now().strftime('%H:%M:%S')
            ws.update(range_name='A1', values=[[f"Última Sync: {ts_str}"]])
            
            try:
                ws.format("B2:F2", {"backgroundColor": {"red": 0.1, "green": 0.1, "blue": 0.1}, "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": True}, "horizontalAlignment": "CENTER"})
                ws.format("B3:F3", {"horizontalAlignment": "CENTER", "textFormat": {"fontSize": 12, "bold": True}})
                ws.format(f"C{start_row+1}:Z{start_row+1}", {"backgroundColor": {"red": 0.2, "green": 0.2, "blue": 0.2}, "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "fontSize": 8}, "horizontalAlignment": "CENTER"})
                ws.format(f"B{start_row+2}:B{start_row+8}", {"textFormat": {"bold": True}})
                ws.format(f"C{start_row+2}:Z{start_row+8}", {"horizontalAlignment": "CENTER", "borders": {"top": {"style": "SOLID"}, "bottom": {"style": "SOLID"}, "left": {"style": "SOLID"}, "right": {"style": "SOLID"}}})
            except: pass
        except Exception as e: logger.error(f"Error Dashboard: {e}")

    def _ensure_sheets(self):
        try:
            sh = self.gc.open(self.config.sheet_name)
            try: sh.worksheet(self.config.worksheet_dashboard)
            except: sh.add_worksheet(self.config.worksheet_dashboard, 100, 26)
            try: sh.worksheet(self.config.worksheet_members)
            except: sh.add_worksheet(self.config.worksheet_members, 100, 10)
            try: sh.worksheet(self.config.worksheet_mythic)
            except: sh.add_worksheet(self.config.worksheet_mythic, 100, 11)
            try: sh.worksheet(self.config.worksheet_stats)
            except: sh.add_worksheet(self.config.worksheet_stats, 1000, 6)
        except: pass

    def _get_today_msgs(self, p_data):
        try: return p_data.get('daily', {}).get(datetime.now().strftime("%Y-%m-%d"), 0)
        except: return 0

    # Nueva función: SOLO actualiza datos, no añade filas si no existen en Master
    def _sync_members_data_only(self, chat_data):
        try:
            sh = self.gc.open(self.config.sheet_name)
            ws = sh.worksheet(self.config.worksheet_members)
            all_vals = ws.get_all_values()
            
            # Crear mapa de filas existentes
            row_map = {}
            for idx, r in enumerate(all_vals):
                if idx > 0 and r: row_map[r[0]] = idx + 1 # row[0] es el nombre
            
            batch = []
            for name, entry in chat_data.items():
                canon = self._get_canonical_name(name)
                # Solo actualizamos si el usuario YA existe en la hoja (puesto por Master Roster)
                if canon and canon in row_map:
                    ridx = row_map[canon]
                    row_data = [
                        entry.get('rankName', '-'), entry.get('rankIndex', 99),
                        entry.get('total', 0), self._get_today_msgs(entry),
                        entry.get('lastSeen', ''), entry.get('lastSeenTS', 0),
                        str(entry.get('lastMessage', ''))
                    ]
                    batch.append({'range': f"B{ridx}:H{ridx}", 'values': [row_data]})
            
            if batch: ws.batch_update(batch)
        except: pass

    def _sync_stats(self, stats_list):
        try:
            sh = self.gc.open(self.config.sheet_name)
            ws = sh.worksheet(self.config.worksheet_stats)
            all_values = ws.get_all_values()
            existing = set()
            for idx, r in enumerate(all_values):
                if idx > 0 and r: existing.add(str(r[0]))
            updates = []
            next_row = len(all_values) + 1
            sorted_snaps = sorted(stats_list, key=lambda x: x.get('ts', 0))
            for snapshot in sorted_snaps:
                ts = str(snapshot.get('ts', 0))
                if ts not in existing and ts != "0":
                    dt = datetime.fromtimestamp(int(ts))
                    row = [ts, dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M"), snapshot.get('onlineCount', 0)]
                    updates.append({'range': f"A{next_row}:D{next_row}", 'values': [row]})
                    next_row += 1
            if updates: ws.batch_update(updates)
        except: pass

if __name__ == "__main__":
    try:
        bridge = GuildActivityBridge(Config())
        bridge.start()
    except KeyboardInterrupt: pass
    except Exception as e: logger.error(f"Fatal: {e}")