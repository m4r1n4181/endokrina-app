/**
 * Shell for every staff page: a quiet sidebar on desktop, a top bar with a menu on phones,
 * and a centred content column. Pages put their own title in <PageHeader>.
 */
import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { ChevronLeft, LayoutList, LogOut, Menu, ShieldCheck, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { BrandMark } from '@/components/brand';
import { NotEmrNotice } from '@/components/not-emr-notice';
import { useStaffAuth } from '@/hooks/use-staff-auth';
import { staffRoleLabel } from '@/lib/labels';
import { normalizePersonName } from '@/lib/person-name';
import { cn } from '@/lib/utils';

type NavItem = { label: string; icon: typeof Users; href: string };

function useNavItems(): NavItem[] {
  const { user } = useStaffAuth();
  // "Revizijski dnevnik" is intentionally NOT part of staff navigation
  // (frontend visibility only — backend audit logging stays untouched and permanent).
  return [
    { label: 'Termini', icon: LayoutList, href: '/dashboard' },
    ...(user?.role === 'clinic_admin' ? [{ label: 'Osoblje', icon: Users, href: '/admin/staff' }] : []),
    { label: 'Bezbednost', icon: ShieldCheck, href: '/security' },
  ];
}

function isActive(location: string, href: string): boolean {
  if (href === '/dashboard') {
    return location.startsWith('/dashboard') || location.startsWith('/appointments') || location.startsWith('/patients');
  }
  return location.startsWith(href);
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();
  const items = useNavItems();

  return (
    <nav aria-label="Glavna navigacija" className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(location, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-md px-3 text-base transition-colors duration-150',
              active
                ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <item.icon className="size-5 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function UserBlock({ onLogout }: { onLogout: () => void }) {
  const { user } = useStaffAuth();
  const name = user?.fullName ? normalizePersonName(user.fullName) : '';

  return (
    <div className="border-t border-sidebar-border pt-4">
      <p className="truncate text-base font-medium">{name}</p>
      <p className="text-sm text-muted-foreground">{staffRoleLabel(user?.role)}</p>
      <Button variant="ghost" className="mt-2 w-full justify-start px-3 text-muted-foreground" onClick={onLogout}>
        <LogOut aria-hidden="true" />
        Odjavi se
      </Button>
    </div>
  );
}

export function StaffLayout({ children }: { children: ReactNode; title?: string }) {
  const { logout } = useStaffAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-background md:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-4 py-6 md:flex">
        <Link href="/dashboard" className="mb-8 px-3">
          <BrandMark />
        </Link>
        <div className="flex-1">
          <NavList />
        </div>
        <UserBlock onLogout={logout} />
      </aside>

      {/* Phone top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-card px-2 md:hidden">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Otvori meni">
              <Menu aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="flex w-72 flex-col gap-6 bg-sidebar p-4 pt-6">
            <SheetHeader className="px-3 text-left">
              <SheetTitle asChild>
                <div>
                  <BrandMark />
                </div>
              </SheetTitle>
              <SheetDescription className="sr-only">Navigacija portala</SheetDescription>
            </SheetHeader>
            <div className="flex-1">
              <NavList onNavigate={() => setMenuOpen(false)} />
            </div>
            <UserBlock
              onLogout={() => {
                setMenuOpen(false);
                logout();
              }}
            />
          </SheetContent>
        </Sheet>
        <Link href="/dashboard">
          <BrandMark compact />
        </Link>
      </header>

      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 md:px-8 md:pt-10">
          {children}
          <NotEmrNotice variant="staff" className="mt-12" />
        </div>
      </main>
    </div>
  );
}

/**
 * The page's title row: optional back link, the one h1, a line of context and the page's
 * actions. Actions sit to the right on wide screens and wrap under the title on phones.
 */
export function PageHeader({
  title,
  description,
  back,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-8">
      {back && (
        <Link
          href={back.href}
          className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-base text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-foreground md:text-3xl">{title}</h1>
          {description && <div className="mt-2 text-lg text-muted-foreground">{description}</div>}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
            {actions}
          </div>
        )}
      </div>
      {children}
    </header>
  );
}
