"use client"

import { useState } from "react"
import { Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

interface ThemeToggleProps {
    className?: string
    isDark?: boolean
    onToggle?: () => void
}

export function ThemeToggle({ className, isDark: controlledIsDark, onToggle }: ThemeToggleProps) {
    const [internalDark, setInternalDark] = useState(true)

    // Use controlled props if provided, otherwise fall back to internal state
    const isDark = controlledIsDark !== undefined ? controlledIsDark : internalDark

    const handleClick = () => {
        if (onToggle) {
            onToggle()
        } else {
            setInternalDark(!internalDark)
        }
    }

    // next-themes
    // const { resolvedTheme, setTheme } = useTheme()
    // const isDark = resolvedTheme === "dark"
    // onClick={() => setTheme(isDark ? "light" : "dark")}

    return (
        <div
            className={cn(
                "flex w-16 h-8 p-1 rounded-full cursor-pointer transition-all duration-300",
                isDark
                    ? "bg-zinc-950 border border-zinc-800"
                    : "bg-white border border-zinc-200",
                className
            )}
            onClick={handleClick}
            role="button"
            tabIndex={0}
        >
            <div className="flex justify-between items-center w-full">
                <div
                    className={cn(
                        "flex justify-center items-center w-6 h-6 rounded-full transition-transform duration-300",
                        isDark
                            ? "transform translate-x-0 bg-zinc-800"
                            : "transform translate-x-8 bg-gray-200"
                    )}
                >
                    {isDark ? (
                        <Moon
                            className="w-4 h-4 text-white"
                            strokeWidth={1.5}
                        />
                    ) : (
                        <Sun
                            className="w-4 h-4 text-gray-700"
                            strokeWidth={1.5}
                        />
                    )}
                </div>
                <div
                    className={cn(
                        "flex justify-center items-center w-6 h-6 rounded-full transition-transform duration-300",
                        isDark
                            ? "bg-transparent"
                            : "transform -translate-x-8"
                    )}
                >
                    {isDark ? (
                        <Sun
                            className="w-4 h-4 text-gray-500"
                            strokeWidth={1.5}
                        />
                    ) : (
                        <Moon
                            className="w-4 h-4 text-black"
                            strokeWidth={1.5}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}
