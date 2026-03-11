import React, { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const InstallPrompt: React.FC = () => {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [dismissed, setDismissed] = useState(false);
    const [installed, setInstalled] = useState(false);

    useEffect(() => {
        const isDismissed = localStorage.getItem('ecopulse_install_dismissed');
        if (isDismissed) setDismissed(true);

        const handler = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
        };

        window.addEventListener('beforeinstallprompt', handler);

        window.addEventListener('appinstalled', () => {
            setInstalled(true);
            setDeferredPrompt(null);
        });

        return () => window.removeEventListener('beforeinstallprompt', handler);
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') setInstalled(true);
        setDeferredPrompt(null);
    };

    const handleDismiss = () => {
        setDismissed(true);
        localStorage.setItem('ecopulse_install_dismissed', 'true');
    };

    if (dismissed || installed || !deferredPrompt) return null;

    return (
        <div className="mx-6 mt-4 mb-0 animate-in slide-in-from-top-4 duration-500">
            <div className="relative flex items-center gap-4 p-4 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl shadow-lg shadow-emerald-500/20 overflow-hidden">
                {/* Background glow */}
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/50 to-teal-600/50 blur-2xl" />

                <div className="relative w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <i className="fa-solid fa-leaf text-white text-lg" />
                </div>

                <div className="relative flex-1 min-w-0">
                    <div className="text-[11px] font-black text-white/80 uppercase tracking-[0.14em]">Install App</div>
                    <div className="text-xs text-white font-semibold leading-tight">
                        Add EcoPulse to your home screen for quick access & offline use
                    </div>
                </div>

                <div className="relative flex items-center gap-2 flex-shrink-0">
                    <button
                        onClick={handleInstall}
                        className="px-3 py-1.5 bg-white text-emerald-600 text-xs font-black rounded-xl shadow hover:scale-105 transition-transform"
                    >
                        Install
                    </button>
                    <button
                        onClick={handleDismiss}
                        className="w-7 h-7 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors"
                    >
                        <i className="fa-solid fa-xmark text-white text-xs" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InstallPrompt;
