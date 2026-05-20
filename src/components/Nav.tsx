export type TabId = "home" | "units" | "expedition" | "logs" | "command" | "collection" | "settings";

const NAV_ITEMS: { id: TabId; label: string; icon: string }[] = [
  { id: "home", label: "ホーム", icon: "♛" },
  { id: "units", label: "配下", icon: "⚔" },
  { id: "expedition", label: "遠征", icon: "◆" },
  { id: "logs", label: "記録", icon: "☰" },
  { id: "command", label: "司令部", icon: "✦" },
  { id: "collection", label: "図鑑", icon: "◇" },
  { id: "settings", label: "設定", icon: "⚙" },
];

interface NavProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

const Nav = ({ active, onChange }: NavProps) => (
  <nav className="nav-bar" aria-label="主要画面">
    {NAV_ITEMS.map((item) => (
      <button
        key={item.id}
        className={active === item.id ? "nav-button is-active" : "nav-button"}
        type="button"
        onClick={() => onChange(item.id)}
      >
        <span className="nav-icon" aria-hidden="true">
          {item.icon}
        </span>
        <span>{item.label}</span>
      </button>
    ))}
  </nav>
);

export default Nav;
