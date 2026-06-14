import { useEffect, useState } from "react";

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

const MOBILE_MENU_ITEMS = NAV_ITEMS.filter((item) => ["command", "collection", "settings"].includes(item.id));

interface NavProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

const Nav = ({ active, onChange }: NavProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuActive = MOBILE_MENU_ITEMS.some((item) => item.id === active);

  useEffect(() => {
    setMenuOpen(false);
  }, [active]);

  const moveTo = (tab: TabId) => {
    setMenuOpen(false);
    onChange(tab);
  };

  return (
    <nav className="nav-bar" aria-label="主要画面">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          className={[
            "nav-button",
            active === item.id ? "is-active" : "",
            MOBILE_MENU_ITEMS.some((menuItem) => menuItem.id === item.id) ? "is-mobile-secondary" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          type="button"
          onClick={() => moveTo(item.id)}
        >
          <span className="nav-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
      <button
        className={menuActive ? "nav-button mobile-menu-button is-active" : "nav-button mobile-menu-button"}
        type="button"
        aria-expanded={menuOpen}
        aria-controls="mobile-nav-menu"
        onClick={() => setMenuOpen((current) => !current)}
      >
        <span className="nav-icon" aria-hidden="true">
          ⋯
        </span>
        <span>メニュー</span>
      </button>
      <div id="mobile-nav-menu" className={menuOpen ? "mobile-menu-panel is-open" : "mobile-menu-panel"}>
        {MOBILE_MENU_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={active === item.id ? "mobile-menu-item is-active" : "mobile-menu-item"}
            onClick={() => moveTo(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default Nav;
