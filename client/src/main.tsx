import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { envProblems } from "./config/env";
import "./styles/globals.css";

const root = createRoot(document.getElementById("root")!);

/**
 * A misconfigured build (missing VITE_API_URL or Firebase keys) shows what's missing instead of
 * a blank screen. The app is imported only after the check passes, so no module that reads
 * `env` ever runs with a bad configuration.
 */
function ConfigErrorScreen({ problems }: { problems: string[] }) {
  return (
    <main className="page" role="alert">
      <h1 className="page__title">This app isn't configured yet</h1>
      <p className="page__lead">
        Copy <code>client/.env.example</code> to <code>client/.env</code>, fill in the values below, then restart the
        dev server.
      </p>
      <ul>
        {problems.map((problem) => (
          <li key={problem}>
            <code>{problem}</code>
          </li>
        ))}
      </ul>
    </main>
  );
}

if (envProblems.length > 0) {
  root.render(<ConfigErrorScreen problems={envProblems} />);
} else {
  void import("./App").then(({ App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
}
