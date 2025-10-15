"use client";

import React from "react";

export default function Background() {
  return (
    <div aria-hidden="true">
      <div
        className="fixed inset-0 -z-50 bg-center bg-no-repeat bg-auto sm:bg-cover"
        style={{ backgroundImage: 'url(/newbg.png)', filter: 'blur(10px)', willChange: 'filter' }}
      />
      <div className="fixed inset-0 -z-40 bg-white/20" />
    </div>
  );
}
