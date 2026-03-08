"use client";

import { forwardRef, useState } from "react";

interface QuickAddInputProps {
  onSubmit: (value: string) => Promise<void>;
  placeholder?: string;
  className?: string;
}

export const QuickAddInput = forwardRef<HTMLInputElement, QuickAddInputProps>(function QuickAddInput(
  { onSubmit, placeholder = "", className = "" },
  ref,
) {
  const [value, setValue] = useState("");

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return;
        await onSubmit(trimmed);
        setValue("");
      }}
      className={className}
    >
      <input
        ref={ref}
        value={value}
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        data-no-compose="true"
        className="quick-add-input quick-add-line w-full border-0 bg-transparent outline-none"
      />
    </form>
  );
});
