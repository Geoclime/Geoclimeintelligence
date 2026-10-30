import { usePwa } from "../../hooks/usePwa";
import { useToast } from "../../hooks/useToast";
import { buttonClassName, type ButtonSize, type ButtonVariant } from "../shared/Button";
import { Icon } from "../shared/Icon";

interface InstallAppButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

/**
 * "Install app", shown only when the browser offers installation (Chrome, Edge and Android) and
 * the app isn't already installed. iPhone users add it from Safari's Share menu instead.
 */
export function InstallAppButton({ variant = "secondary", size = "sm", className }: InstallAppButtonProps) {
  const { canInstall, standalone, install } = usePwa();
  const { showToast } = useToast();
  if (!canInstall || standalone) return null;

  const onClick = async () => {
    if (await install()) showToast({ type: "success", message: "GeoClime Intelligence is installed. Open it from your home screen or app list." });
  };

  return (
    <button type="button" className={buttonClassName({ variant, size, className })} onClick={onClick} data-cy="install-app">
      <Icon name="download" size={16} />
      <span>Install app</span>
    </button>
  );
}
