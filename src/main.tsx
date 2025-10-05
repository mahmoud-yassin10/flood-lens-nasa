import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { BrowserRouter } from "react-router-dom";

<BrowserRouter basename={import.meta.env.BASE_URL}>
  <App />
</BrowserRouter>
createRoot(document.getElementById("root")!).render(<App />);
