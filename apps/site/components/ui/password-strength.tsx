"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Circle, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

type PasswordStrengthFieldProps = {
  name: string;
  label?: string;
  minLength?: number;
  disabled?: boolean;
  placeholder?: string;
  autoComplete?: string;
  className?: string;
  inputClassName?: string;
};

export function PasswordStrengthField({
  name,
  label = "Senha",
  minLength = 10,
  disabled = false,
  placeholder = "Crie uma senha forte",
  autoComplete = "new-password",
  className,
  inputClassName,
}: PasswordStrengthFieldProps) {
  const [value, setValue] = useState("");
  const [visible, setVisible] = useState(false);
  const rules = useMemo(() => [
    { label: `${minLength}+ caracteres`, ok: value.length >= minLength },
    { label: "Uma letra maiúscula", ok: /[A-ZÀ-Ý]/.test(value) },
    { label: "Uma letra minúscula", ok: /[a-zà-ÿ]/.test(value) },
    { label: "Um número", ok: /\d/.test(value) },
  ], [minLength, value]);
  const score = rules.filter((rule) => rule.ok).length;
  const strength = score <= 1 ? "Fraca" : score === 2 ? "Média" : score === 3 ? "Boa" : "Forte";

  return (
    <div className={cn("grid gap-2", className)}>
      {label ? <label htmlFor={name} className="text-sm font-extrabold">{label}</label> : null}
      <div className="relative">
        <input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          minLength={minLength}
          maxLength={128}
          autoComplete={autoComplete}
          required
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className={cn("input pr-12", inputClassName)}
          aria-describedby={`${name}-strength`}
        />
        <button
          type="button"
          className="ui-button absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg border-0 bg-transparent p-0 text-[var(--muted)] shadow-none"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          disabled={disabled}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      <div id={`${name}-strength`} className="grid gap-2" aria-live="polite">
        <div className="flex items-center gap-2">
          <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((item) => (
              <span key={item} className={cn("h-1.5 rounded-full bg-black/10", item < score && "bg-emerald-500")} />
            ))}
          </div>
          <span className="text-xs font-bold text-[var(--muted)]">{value ? strength : "Defina sua senha"}</span>
        </div>
        <div className="grid gap-1 sm:grid-cols-2">
          {rules.map((rule) => (
            <span key={rule.label} className={cn("flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]", rule.ok && "text-emerald-600")}>
              {rule.ok ? <CheckCircle2 size={13} /> : <Circle size={13} />}
              {rule.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
