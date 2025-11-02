"use client";

import React, { useState } from "react";

type Props = { boatColor: string; setBoatColor: (c: string) => void };

const COLORS = [
  { name: "Red", light: "#f7b0a5", dark: "#d87d76" },
  { name: "Yellow", light: "#f8e6a0", dark: "#d7c46b" },
  { name: "Green", light: "#b7e3b1", dark: "#7cb68e" },
  { name: "Blue", light: "#b7d7f5", dark: "#6fa1c6" },
  { name: "Purple", light: "#c8b7f5", dark: "#8a7cc6" },
  { name: "Pink", light: "#f5b7d7", dark: "#c67ca6" },
  { name: "Pastel Black (Neutral)", light: "#4a4044", dark: "#d5ced0" },
];

export default function ColorChips({ boatColor, setBoatColor }: Props) {
  const [dark, setDark] = useState(false);
  return (
    <div>
      <div className="grid grid-cols-4 gap-4">
        {COLORS.map((c) => {
          const value = dark ? c.dark : c.light;
          const selected = value.toLowerCase() === (boatColor || "").toLowerCase();
          return (
            <button
              key={c.name}
              type="button"
              aria-label={c.name}
              onClick={() => setBoatColor(value)}
              className="aspect-square rounded-md border"
              style={{ background: value, borderColor: "rgba(0,0,0,0.1)", boxShadow: selected ? "0 0 0 2px rgba(0,0,0,0.2) inset" : undefined }}
            />
          );
        })}
      </div>
      <div className="mt-3">
        <button type="button" className="rounded-md px-3 py-2 btn font-sans" onClick={() => setDark((d) => !d)}>
          Toggle Dark Mode
        </button>
      </div>
    </div>
  );
}


