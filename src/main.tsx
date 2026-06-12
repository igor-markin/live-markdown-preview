import { render } from "preact";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("app");

if (!root) {
  throw new Error("App root was not found.");
}

render(<App />, root);
