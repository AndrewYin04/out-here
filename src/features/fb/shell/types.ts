// Data the shell renders. The shell never calls the data layer itself: the integration
// passes live values into ShellDataProvider; until then the static demo data fills them.

export type ShellPerson = { handle: string; name: string; avatarUrl: string | null };

export type ShellContact = ShellPerson & { online: boolean };

/** A group in the "Your shortcuts" list. */
export type ShellShortcut = { slug: string; name: string; imageUrl: string | null };

/** A named Messenger thread shown under "Group conversations". */
export type ShellGroupChat = { id: string; name: string; members: ShellPerson[] };

/** Everything the shell shows for one signed-in persona. */
export type ShellViewerData = {
  viewer: ShellPerson;
  contacts: ShellContact[];
  shortcuts: ShellShortcut[];
  groupChats: ShellGroupChat[];
  /** Friends whose (fictional) birthday is today. */
  birthdays: ShellPerson[];
  notificationCount: number;
  messageCount: number;
};

/** Static fallback: the 8 switchable personas and the shell data for each of them. */
export type ShellStaticData = {
  personas: ShellPerson[];
  viewers: Record<string, ShellViewerData>;
  defaultHandle: string;
};

export type ShellContextValue = ShellViewerData & {
  personas: ShellPerson[];
  /** Handle of the active persona (from ?as=, then sessionStorage, then the default). */
  activeHandle: string;
  switchPersona: (handle: string) => void;
};
