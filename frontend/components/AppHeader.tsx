import Link from "next/link";
import type { ReactNode } from "react";
import { GoogleConnect } from "./GoogleConnect";
import { SignIn } from "./SignIn";
import { UserAvatar } from "./UserAvatar";
import { ThemeToggle } from "./ThemeToggle";
import { Icon } from "./ui/Icon";
import styles from "./AppHeader.module.css";

export function AppHeader({
  docTitle,
  center,
  actions,
}: {
  docTitle?: string;
  center?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        <span className={styles.mark}>
          <Icon name="logo" size={16} />
        </span>
        <span className={styles.wordmark}>Deckhand</span>
      </Link>

      <div className={styles.center}>
        {docTitle && (
          <>
            <span className={styles.divider} aria-hidden />
            <span className={styles.docTitle} title={docTitle}>
              {docTitle}
            </span>
          </>
        )}
        {center}
      </div>

      <div className={styles.actions}>
        {actions}
        <SignIn />
        <GoogleConnect />
        <ThemeToggle />
        <UserAvatar />
      </div>
    </header>
  );
}
