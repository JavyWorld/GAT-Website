import { useEffect, useRef } from "react";

interface Thread {
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  opacity: number;
  hue: number;
}

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const threadsRef = useRef<Thread[]>([]);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const threadCount = 25;
    threadsRef.current = Array.from({ length: threadCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      length: 80 + Math.random() * 120,
      opacity: 0.1 + Math.random() * 0.15,
      hue: Math.random() > 0.7 ? 43 : 210,
    }));

    const animate = () => {
      ctx.fillStyle = "rgba(10, 14, 26, 0.03)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      threadsRef.current.forEach((thread) => {
        thread.x += thread.vx;
        thread.y += thread.vy;

        if (thread.x < 0 || thread.x > canvas.width) thread.vx *= -1;
        if (thread.y < 0 || thread.y > canvas.height) thread.vy *= -1;

        const gradient = ctx.createLinearGradient(
          thread.x,
          thread.y,
          thread.x + thread.length * thread.vx * 10,
          thread.y + thread.length * thread.vy * 10
        );

        gradient.addColorStop(0, `hsla(${thread.hue}, 90%, 55%, 0)`);
        gradient.addColorStop(0.5, `hsla(${thread.hue}, 90%, 55%, ${thread.opacity})`);
        gradient.addColorStop(1, `hsla(${thread.hue}, 90%, 55%, 0)`);

        ctx.beginPath();
        ctx.moveTo(thread.x - thread.length * 0.5, thread.y - thread.length * 0.5);
        ctx.lineTo(thread.x + thread.length * 0.5, thread.y + thread.length * 0.5);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    ctx.fillStyle = "#0a0e1a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ background: "linear-gradient(180deg, #0a0e1a 0%, #000000 100%)" }}
    />
  );
}
