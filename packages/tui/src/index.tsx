#!/usr/bin/env bun
import React from "react";
import { render } from "ink";
import { App } from "./app";

await render(<App />).waitUntilExit();
