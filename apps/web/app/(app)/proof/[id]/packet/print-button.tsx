"use client";

import { Button } from "@streamline/ui";
import { Printer } from "lucide-react";

/** The one client component on the packet: it calls the browser's print dialog and nothing else. */
export function PrintButton() {
  return (
    <Button variant="secondary" leadingIcon={<Printer size={16} />} onClick={() => window.print()}>
      Print this packet
    </Button>
  );
}
