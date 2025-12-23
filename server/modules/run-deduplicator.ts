interface ExistingRun {
  dungeon: string;
  keyLevel: number;
  timestamp: Date;
  url: string | null;
}

interface ApiRun {
  dungeon: string;
  mythic_level: number;
  completed_at: string;
  url?: string;
}

export class RunDeduplicator {
  private urlSet: Set<string>;
  private compositeKeySet: Set<string>;

  constructor(existingRuns: ExistingRun[]) {
    this.urlSet = new Set(
      existingRuns.filter(r => r.url).map(r => r.url!)
    );
    this.compositeKeySet = new Set(
      existingRuns
        .filter(r => !r.url)
        .map(r => this.makeCompositeKey(r.dungeon, r.keyLevel, r.timestamp))
    );
  }

  private normalizeTimestamp(timestamp: Date): number {
    const utcMidnight = Date.UTC(
      timestamp.getUTCFullYear(),
      timestamp.getUTCMonth(),
      timestamp.getUTCDate()
    );
    return utcMidnight;
  }

  private makeCompositeKey(dungeon: string, keyLevel: number, timestamp: Date): string {
    const normalizedMs = this.normalizeTimestamp(timestamp);
    return `${dungeon}-${keyLevel}-${normalizedMs}`;
  }

  isNewRun(run: ApiRun): boolean {
    const compositeKey = this.makeCompositeKey(
      run.dungeon,
      run.mythic_level,
      new Date(run.completed_at)
    );

    const existsByUrl = run.url && this.urlSet.has(run.url);
    const existsByCompositeKey = this.compositeKeySet.has(compositeKey);

    return !existsByUrl && !existsByCompositeKey;
  }

  markAsSeen(run: ApiRun): void {
    const compositeKey = this.makeCompositeKey(
      run.dungeon,
      run.mythic_level,
      new Date(run.completed_at)
    );

    if (run.url) {
      this.urlSet.add(run.url);
    } else {
      this.compositeKeySet.add(compositeKey);
    }
  }
}
