import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge conditional classes and resolve Tailwind conflicts for UI components. */
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
