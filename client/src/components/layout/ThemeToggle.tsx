import { useId } from "react";
import type { ThemePreference } from "../../contexts/ThemeContext";
import { useTheme } from "../../hooks/useTheme";
import { Icon, type IconName } from "../shared/Icon";

const OPTIONS: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: "system", label: "Match device", icon: "monitor" },
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
];

/** A three-way segmented control. Radio inputs, so arrow keys and screen readers just work. */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const groupName = useId();
  return (
    <fieldset className="theme-toggle" data-cy="theme-toggle">
      <legend className="visually-hidden">Colour theme</legend>
      {OPTIONS.map((option) => (
        <label key={option.value} className="theme-toggle__option" title={option.label}>
          <input
            type="radio"
            name={groupName}
            value={option.value}
            checked={preference === option.value}
            onChange={() => setPreference(option.value)}
            className="visually-hidden"
          />
          <Icon name={option.icon} size={16} />
          <span className="visually-hidden">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
