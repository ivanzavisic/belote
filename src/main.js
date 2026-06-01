import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import { preloadCards } from "./lib/preloadCards.js";

preloadCards();

const app = mount(App, { target: document.getElementById("app") });

export default app;
