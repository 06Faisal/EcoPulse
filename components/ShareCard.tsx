import React, { useRef, useState } from 'react';
import { UserProfile, Trip, UtilityBill } from '../services/types';

interface ShareCardProps {
    user: UserProfile;
    trips: Trip[];
    bills: UtilityBill[];
    onClose: () => void;
}

// ─── Canvas renderer ──────────────────────────────────────────────────────────

function drawCard(
    canvas: HTMLCanvasElement,
    user: UserProfile,
    totalCO2: number,
    savedCO2: number,
    bestDay: { date: string; co2: number } | null
) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 900;
    const H = 500;
    canvas.width = W;
    canvas.height = H;

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0f172a');
    bg.addColorStop(0.5, '#064e3b');
    bg.addColorStop(1, '#0f172a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(16,185,129,0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 60) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 60) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Glow circle
    const glow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 300);
    glow.addColorStop(0, 'rgba(16,185,129,0.15)');
    glow.addColorStop(1, 'rgba(16,185,129,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Leaf icon (text fallback)
    ctx.font = 'bold 48px sans-serif';
    ctx.fillStyle = '#10b981';
    ctx.fillText('🌿', 48, 80);

    // Title
    ctx.font = 'bold 28px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('EcoPulse AI', 110, 68);
    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('Carbon Footprint Report', 110, 90);

    // Divider
    ctx.strokeStyle = 'rgba(16,185,129,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(48, 110);
    ctx.lineTo(W - 48, 110);
    ctx.stroke();

    // User name
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(user.name, 48, 155);

    // Stats
    const stats = [
        { label: 'CO₂ This Month', value: `${totalCO2.toFixed(1)} kg`, color: '#f87171' },
        { label: 'CO₂ Saved vs Avg', value: `${savedCO2.toFixed(1)} kg`, color: '#34d399' },
        { label: 'Streak', value: `${user.streak} days 🔥`, color: '#fbbf24' },
        { label: 'Eco Points', value: `${user.points.toLocaleString()}`, color: '#60a5fa' },
    ];

    const colW = (W - 96) / 2;
    stats.forEach((s, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 48 + col * (colW + 16);
        const y = 195 + row * 110;

        // Card bg
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        roundRect(ctx, x, y, colW, 90, 16);
        ctx.fill();

        // Accent bar
        ctx.fillStyle = s.color;
        roundRect(ctx, x, y, 4, 90, 4);
        ctx.fill();

        ctx.font = '12px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(s.label, x + 20, y + 32);

        ctx.font = 'bold 28px sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(s.value, x + 20, y + 65);
    });

    // Best day
    if (bestDay) {
        ctx.font = '12px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText(`Best day: ${bestDay.date} · ${bestDay.co2.toFixed(2)} kg`, 48, H - 40);
    }

    // Watermark
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = 'rgba(16,185,129,0.6)';
    ctx.textAlign = 'right';
    ctx.fillText('ecopulse.app', W - 48, H - 40);
    ctx.textAlign = 'left';
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

// ─── Component ────────────────────────────────────────────────────────────────

const ShareCard: React.FC<ShareCardProps> = ({ user, trips, bills, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [sharing, setSharing] = useState(false);
    const [drawn, setDrawn] = useState(false);

    // Compute stats
    const now = new Date();
    const monthTrips = trips.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const totalCO2 = monthTrips.reduce((s, t) => s + t.co2, 0);

    // Estimate saved: assume average Indian is 150 kg/month transport
    const savedCO2 = Math.max(0, 150 - totalCO2);

    const bestDay = (() => {
        const days: Record<string, number> = {};
        monthTrips.forEach(t => {
            const d = t.date.split('T')[0];
            days[d] = (days[d] || 0) + t.co2;
        });
        const sorted = Object.entries(days).sort((a, b) => a[1] - b[1]);
        if (!sorted.length) return null;
        return { date: sorted[0][0], co2: sorted[0][1] };
    })();

    React.useEffect(() => {
        if (canvasRef.current && !drawn) {
            drawCard(canvasRef.current, user, totalCO2, savedCO2, bestDay);
            setDrawn(true);
        }
    }, [drawn, user, totalCO2, savedCO2, bestDay]);

    const handleShare = async () => {
        if (!canvasRef.current) return;
        setSharing(true);
        try {
            const blob = await new Promise<Blob>((resolve, reject) => {
                canvasRef.current!.toBlob((b) => b ? resolve(b) : reject(), 'image/png');
            });
            const file = new File([blob], 'ecopulse-report.png', { type: 'image/png' });

            if (navigator.share && navigator.canShare?.({ files: [file] })) {
                await navigator.share({
                    title: 'My EcoPulse Carbon Report',
                    text: `🌱 I saved ${savedCO2.toFixed(1)} kg CO₂ this month with EcoPulse! Check out your footprint too.`,
                    files: [file],
                });
            } else {
                // Fallback: download
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'ecopulse-report.png';
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch {
            // user cancelled — do nothing
        } finally {
            setSharing(false);
        }
    };

    const handleWhatsApp = async () => {
        const text = encodeURIComponent(
            `🌱 My EcoPulse Carbon Report:\n` +
            `• CO₂ this month: ${totalCO2.toFixed(1)} kg\n` +
            `• Saved vs avg: ${savedCO2.toFixed(1)} kg\n` +
            `• Streak: ${user.streak} days 🔥\n` +
            `• Points: ${user.points.toLocaleString()}\n\n` +
            `Track your footprint at ecopulse.app 🌍`
        );
        window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-md bg-slate-900 rounded-[2.5rem] p-6 space-y-5 animate-in slide-in-from-bottom-8 duration-400">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black text-white">Your Carbon Report</h3>
                    <button onClick={onClose} className="w-8 h-8 bg-slate-800 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                        <i className="fa-solid fa-xmark text-xs" />
                    </button>
                </div>

                {/* Canvas preview */}
                <div className="rounded-2xl overflow-hidden border border-white/10">
                    <canvas ref={canvasRef} className="w-full" style={{ imageRendering: 'crisp-edges' }} />
                </div>

                {/* Stats summary */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-slate-800 rounded-2xl text-center">
                        <div className="text-[11px] font-black text-slate-400 uppercase mb-1">CO₂ This Month</div>
                        <div className="text-lg font-black text-white">{totalCO2.toFixed(1)} <span className="text-xs text-slate-400">kg</span></div>
                    </div>
                    <div className="p-3 bg-emerald-500/10 rounded-2xl text-center border border-emerald-500/20">
                        <div className="text-[11px] font-black text-emerald-400 uppercase mb-1">Saved vs Avg</div>
                        <div className="text-lg font-black text-emerald-400">{savedCO2.toFixed(1)} <span className="text-xs">kg</span></div>
                    </div>
                </div>

                {/* Share buttons */}
                <div className="flex gap-3">
                    <button
                        onClick={handleWhatsApp}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#25D366] hover:bg-[#1ebe59] rounded-2xl text-white font-black text-sm transition-colors"
                    >
                        <i className="fa-brands fa-whatsapp text-lg" /> WhatsApp
                    </button>
                    <button
                        onClick={handleShare}
                        disabled={sharing}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-slate-700 hover:bg-slate-600 rounded-2xl text-white font-black text-sm transition-colors disabled:opacity-50"
                    >
                        {sharing
                            ? <i className="fa-solid fa-spinner animate-spin" />
                            : <><i className="fa-solid fa-share-nodes" /> Share / Save</>
                        }
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ShareCard;
