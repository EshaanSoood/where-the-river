"use client";

import React from "react";

export default function Background() {
  return (
    <div aria-hidden="true">
      <div
        className="fixed inset-0 -z-50 bg-center bg-cover"
        style={{ backgroundImage: 'url(/dreamriverbg.jpg)', filter: 'blur(2px)' }}
      />
      <div className="fixed inset-0 -z-40 bg-white/20" />
    </div>
  );
}
