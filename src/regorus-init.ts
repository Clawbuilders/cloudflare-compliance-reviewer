/** Side-effect module: instantiate the Regorus engine from the wasm that ships with the Worker. Import it from any Worker entry/workflow. */
import wasm from "../vendor/regorus/regorusjs_bg.wasm";
import { initRegorus } from "./policy-engine";

initRegorus(wasm);
