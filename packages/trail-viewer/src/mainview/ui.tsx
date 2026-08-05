/**
 * Small shared UI helpers for the trail-viewer mainview.
 */

import { useTheme } from "@principal-ade/industry-theme";

export function CenteredMessage({
	title,
	detail,
}: {
	title: string;
	detail?: string;
}) {
	const { theme } = useTheme();
	return (
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background: theme.colors.background,
				color: theme.colors.text,
				fontFamily: theme.fonts.body,
			}}
		>
			<div style={{ textAlign: "center", maxWidth: 640, padding: 24 }}>
				<div style={{ fontSize: theme.fontSizes[3], marginBottom: 8 }}>{title}</div>
				{detail && (
					<div
						style={{
							fontSize: theme.fontSizes[0],
							color: theme.colors.textMuted ?? theme.colors.textSecondary,
							fontFamily: theme.fonts.monospace,
							whiteSpace: "pre-wrap",
						}}
					>
						{detail}
					</div>
				)}
			</div>
		</div>
	);
}
