import React, { useRef, useState, useEffect } from 'react';
import { UserProfile, Trip, UtilityBill } from '../services/types';

interface MonthlyReportProps {
    user: UserProfile;
    trips: Trip[];
    bills: UtilityBill[];
    onClose: () => void;
}

function drawMonthlyCard(
    canvas: HTMLCanvasElement,
    user: UserProfile,
    stats: {
        totalCO2: number;
        tripCount: number;
        bestWeekCO2: number;
        worstWeekCO2: number;
        deltaVsLastMonth: number | null;
        streak: number;
        topVehicle: string;
        savedVsAvg: number;
        monthName: string;
        year: number;
    }
) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 900;
    const H = 600;
    canvas.width = W;
    canvas.height = H;

    // Dark background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#020617');
    bg.addColorStop(0.4, '#042f2e');
    bg.addColorStop(1, '#020617');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Circular glow top-right
    const glowTR = ctx.createRadialGradient(W, 0, 0, W, 0, 400);
    glowTR.addColorStop(0, 'rgba(16,185,129,0.2)');
    glowTR.addColorStop(1, 'rgba(16,185,129,0)');
    ctx.fillStyle = glowTR;
    ctx.fillRect(0, 0, W, H);

    // Circular glow bottom-left
    const glowBL = ctx.createRadialGradient(0, H, 0, 0, H, 300);
    glowBL.addColorStop(0, 'rgba(99,102,241,0.15)');
    glowBL.addColorStop(1, 'rgba(99,102,241,0)');
    ctx.fillStyle = glowBL;
    ctx.fillRect(0, 0, W, H);

    // Subtle grid
    ctx.strokeStyle = 'rgba(16,185,129,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 50) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }

    // ── Header ──
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#10b981';
    ctx.fillText('🌿 EcoPulse AI', 48, 60);

    ctx.font = 'bold 36px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${stats.monthName} ${stats.year}`, 48, 108);

    ctx.font = '14px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(`${user.name}'s Monthly Carbon Report`, 48, 132);

    // Thin separator
    const sep = ctx.createLinearGradient(48, 0, W - 48, 0);
    sep.addColorStop(0, 'rgba(16,185,129,0.6)');
    sep.addColorStop(1, 'rgba(16,185,129,0)');
    ctx.strokeStyle = sep;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(48, 150);
    ctx.lineTo(W - 48, 150);
    ctx.stroke();

    // ── Big number ──
    ctx.font = 'bold 72px sans-serif';
    ctx.fillStyle = '#10b981';
    ctx.fillText(`${stats.totalCO2.toFixed(1)}`, 48, 250);

    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('kg CO₂ total', 48, 280);

    if (stats.deltaVsLastMonth !== null) {
        const sign = stats.deltaVsLastMonth < 0 ? '▼' : '▲';
        ctx.fillStyle = stats.deltaVsLastMonth < 0 ? '#34d399' : '#f87171';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(`${sign} ${Math.abs(stats.deltaVsLastMonth).toFixed(1)} kg vs last month`, 48, 308);
    }

    // ── Stat cards ──
    const cards = [
        { label: 'Trips Logged', value: String(stats.tripCount), color: '#60a5fa', icon: '🚗' },
        { label: 'Best Week', value: `${stats.bestWeekCO2.toFixed(1)} kg`, color: '#34d399', icon: '⭐' },
        { label: 'Streak', value: `${stats.streak}d 🔥`, color: '#fbbf24', icon: '🔥' },
        { label: 'Top Vehicle', value: stats.topVehicle, color: '#a78bfa', icon: '🚌' },
        { label: 'Saved vs Avg', value: `${stats.savedVsAvg.toFixed(1)} kg`, color: '#10b981', icon: '🌍' },
        { label: 'Eco Points', value: user.points.toLocaleString(), color: '#f472b6', icon: '✨' },
    ];

    const cardW = 230;
    const cardH = 85;
    const colSpacing = 260;
    const rowSpacing = 100;

    cards.forEach((card, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const ox = W / 2 + col * colSpacing - colSpacing;
        const oy = 172 + row * rowSpacing;

        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        roundRectFill(ctx, ox, oy, cardW, cardH, 14);

        ctx.fillStyle = card.color + '33';
        roundRectFill(ctx, ox, oy, 5, cardH, 4);

        ctx.fillStyle = card.color;
        ctx.font = 'bold 21px sans-serif';
        ctx.fillText(card.value, ox + 18, oy + 47);

        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '11px sans-serif';
        ctx.fillText(card.label, ox + 18, oy + 68);
    });

    // ── Footer ──
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = '12px sans-serif';
    ctx.fillText('Track your carbon footprint at', 48, H - 40);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('ecopulse.app', 48 + 185, H - 40);

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.textAlign = 'right';
    ctx.fillText('Generated with 💚 by EcoPulse AI', W - 48, H - 40);
    ctx.textAlign = 'left';
}

function roundRectFill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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
    ctx.fill();
}

// ─── Stats calculator ─────────────────────────────────────────────────────────

function computeStats(user: UserProfile, trips: Trip[], bills: UtilityBill[]) {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    const monthName = now.toLocaleString('default', { month: 'long' });

    const monthTrips = trips.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === month && d.getFullYear() === year;
    });

    const totalCO2 = monthTrips.reduce((s, t) => s + t.co2, 0);

    // Weekly breakdown
    const weekTotals: Record<number, number> = {};
    monthTrips.forEach(t => {
        const d = new Date(t.date);
        const week = Math.floor(d.getDate() / 7);
        weekTotals[week] = (weekTotals[week] || 0) + t.co2;
    });
    const weekValues = Object.values(weekTotals);
    const bestWeekCO2 = weekValues.length ? Math.min(...weekValues) : 0;
    const worstWeekCO2 = weekValues.length ? Math.max(...weekValues) : 0;

    // Last month delta
    const lastMonth = new Date(year, month - 1, 1);
    const lastMonthTrips = trips.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear();
    });
    const lastMonthCO2 = lastMonthTrips.reduce((s, t) => s + t.co2, 0);
    const deltaVsLastMonth = lastMonthTrips.length > 0 ? totalCO2 - lastMonthCO2 : null;

    // Top vehicle
    const vehicleCounts: Record<string, number> = {};
    monthTrips.forEach(t => {
        const v = t.customVehicleName || t.vehicle;
        vehicleCounts[v] = (vehicleCounts[v] || 0) + 1;
    });
    const topVehicle = Object.entries(vehicleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    // Saved vs Indian avg (assume 150 kg/month transport avg)
    const savedVsAvg = Math.max(0, 150 - totalCO2);

    return {
        totalCO2,
        tripCount: monthTrips.length,
        bestWeekCO2,
        worstWeekCO2,
        deltaVsLastMonth,
        streak: user.streak,
        topVehicle,
        savedVsAvg,
        monthName,
        year,
    };
}

// ─── Modal component ──────────────────────────────────────────────────────────

const MonthlyReport: React.FC<MonthlyReportProps> = ({ user, trips, bills, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [sharing, setSharing] = useState(false);
    const stats = computeStats(user, trips, bills);

    useEffect(() => {
        if (canvasRef.current) {
            drawMonthlyCard(canvasRef.current, user, stats);
        }
    }, []);

    const handleShare = async () => {
        if (!canvasRef.current) return;
        setSharing(true);
        try {
            const blob = await new Promise<Blob>((res, rej) => {
                canvasRef.current!.toBlob(b => b ? res(b) : rej(), 'image/png');
            });
            const file = new File([blob], `ecopulse-${stats.monthName}-${stats.year}.png`, { type: 'image/png' });
            if (navigator.share && navigator.canShare?.({ files: [file] })) {
                await navigator.share({
                    title: `My ${stats.monthName} Carbon Report`,
                    text: `🌱 I tracked ${stats.totalCO2.toFixed(1)} kg CO₂ in ${stats.monthName} with EcoPulse! Saved ${stats.savedVsAvg.toFixed(1)} kg vs average.`,
                    files: [file],
                });
            } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ecopulse-${stats.monthName}-${stats.year}.png`;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch {
            /* cancelled */
        } finally {
            setSharing(false);
        }
    };

    const handleWhatsApp = () => {
        const text = encodeURIComponent(
            `🌍 My ${stats.monthName} Carbon Report — EcoPulse AI\n\n` +
            `📊 Total CO₂: ${stats.totalCO2.toFixed(1)} kg\n` +
            `⭐ Best week: ${stats.bestWeekCO2.toFixed(1)} kg\n` +
            `🌱 Saved vs avg: ${stats.savedVsAvg.toFixed(1)} kg\n` +
            `🔥 Streak: ${stats.streak} days\n` +
            `✨ Eco points: ${user.points.toLocaleString()}\n\n` +
            `Track yours at ecopulse.app 🌿`
        );
        window.open(`https://wa.me/?text=${text}`, '_blank');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-md bg-slate-900 rounded-[2.5rem] p-6 space-y-5 animate-in slide-in-from-bottom-8 duration-400 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-black text-white">Monthly Report</h3>
                        <p className="text-[11px] text-slate-400 font-bold uppercase tracking-[0.12em]">{stats.monthName} {stats.year}</p>
                    </div>
                    <button onClick={onClose} className="w-9 h-9 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                        <i className="fa-solid fa-xmark" />
                    </button>
                </div>

                {/* Canvas */}
                <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                    <canvas ref={canvasRef} className="w-full" />
                </div>

                {/* Quick stat pills */}
                <div className="grid grid-cols-3 gap-2">
                    {[
                        { label: 'Trips', value: stats.tripCount, icon: '🚗' },
                        { label: 'Best Week', value: `${stats.bestWeekCO2.toFixed(1)} kg`, icon: '⭐' },
                        { label: 'Saved', value: `${stats.savedVsAvg.toFixed(1)} kg`, icon: '🌱' },
                    ].map(s => (
                        <div key={s.label} className="p-3 bg-slate-800 rounded-2xl text-center">
                            <div className="text-lg mb-0.5">{s.icon}</div>
                            <div className="text-sm font-black text-white">{s.value}</div>
                            <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{s.label}</div>
                        </div>
                    ))}
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
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 rounded-2xl text-white font-black text-sm transition-colors"
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

export default MonthlyReport;
