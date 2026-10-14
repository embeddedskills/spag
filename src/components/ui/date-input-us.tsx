"use client";

type DateInputUsProps = {
	id?: string;
	"aria-label"?: string;
	className?: string;
	value: string;
	onChange: (value: string) => void;
};

export function DateInputUs({
	id,
	"aria-label": ariaLabel,
	className,
	value,
	onChange,
}: DateInputUsProps) {
	return (
		<input
			aria-label={ariaLabel}
			className={className}
			id={id}
			lang="en-US"
			onChange={(event) => onChange(event.target.value)}
			type="date"
			value={value}
		/>
	);
}
