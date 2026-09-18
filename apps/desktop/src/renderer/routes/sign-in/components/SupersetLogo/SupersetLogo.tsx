import { cn } from "@superset/ui/utils";

interface SupersetLogoProps {
	className?: string;
	gradient?: boolean;
}

/**
 * JamAgents wordmark. Personal fork: the upstream pixel-font "Superset" SVG
 * is replaced with a text wordmark so the sign-in screen reads as JamAgents.
 * The component keeps its upstream name so call sites stay untouched.
 */
export function SupersetLogo({
	className,
	gradient = false,
}: SupersetLogoProps) {
	return (
		<span
			role="img"
			aria-label="JamAgents"
			className={cn(
				"inline-flex items-baseline font-mono font-bold tracking-tight text-foreground select-none",
				"text-2xl leading-8",
				gradient && "animate-pulse",
				className,
			)}
		>
			<span>Jam</span>
			<span className="opacity-60">Agents</span>
		</span>
	);
}
