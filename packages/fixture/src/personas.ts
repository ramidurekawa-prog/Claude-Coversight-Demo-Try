/**
 * Demo personas. These are SYNTHETIC users with published demo passwords so a
 * founder can sign in as any role during a walkthrough. They are never real
 * credentials and the seed refuses to run against a non-demo database.
 */
export type PersonaRole = "owner" | "gm" | "finance" | "admin";

export interface Persona {
  /** Stable key, also the seed for the user id. */
  key: string;
  name: string;
  email: string;
  password: string;
  role: PersonaRole;
  /** Org key: "rosewood" | "harbor"; admins belong to Streamline, not a customer. */
  org: "rosewood" | "harbor" | null;
  /** GM scope — the locations this GM may see. Empty for org-wide roles. */
  locations: string[];
  title: string;
}

export const DEMO_PASSWORD = "streamline-demo-2026";

export const PERSONAS: Persona[] = [
  { key: "rose", name: "Rose Jorge", email: "rose@rosewood.example", password: DEMO_PASSWORD, role: "owner", org: "rosewood", locations: [], title: "Owner, Rosewood Group" },
  { key: "dana", name: "Dana Whitfield", email: "dana@rosewood.example", password: DEMO_PASSWORD, role: "finance", org: "rosewood", locations: [], title: "Group controller" },
  { key: "maria", name: "Maria Reyes", email: "maria@rosewood.example", password: DEMO_PASSWORD, role: "gm", org: "rosewood", locations: ["oak"], title: "General manager, Oakland" },
  { key: "sam", name: "Sam Okafor", email: "sam@rosewood.example", password: DEMO_PASSWORD, role: "gm", org: "rosewood", locations: ["brk"], title: "General manager, Berkeley" },
  { key: "priya", name: "Priya Raman", email: "priya@rosewood.example", password: DEMO_PASSWORD, role: "gm", org: "rosewood", locations: ["ala"], title: "General manager, Alameda" },
  { key: "elena", name: "Elena Marsh", email: "elena@harborhouse.example", password: DEMO_PASSWORD, role: "owner", org: "harbor", locations: [], title: "Owner, Harbor House Group" },
  { key: "admin", name: "Streamline admin", email: "admin@streamline.example", password: DEMO_PASSWORD, role: "admin", org: null, locations: [], title: "Streamline (Coversight) operations" },
];

export const DEFAULT_PERSONA = PERSONAS[0] as Persona;
