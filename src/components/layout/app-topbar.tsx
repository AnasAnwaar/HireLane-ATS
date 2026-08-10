"use client";

import { Bell, Menu, Search, Settings, ShieldCheck, User } from "lucide-react";
import Link from "next/link";

import { SignOutButton } from "@/components/layout/sign-out-button";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type TopbarUser = {
  name: string;
  email: string;
  role: string;
  organization: string;
};

export function AppTopbar({
  user,
  onToggleSidebar,
}: {
  user: TopbarUser;
  onToggleSidebar?: () => void;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur-sm sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Toggle navigation"
        onClick={onToggleSidebar}
      >
        <Menu className="size-4" />
      </Button>

      <label className="relative hidden max-w-sm flex-1 items-center md:flex">
        <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search candidates, openings…"
          className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-14 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-ring/20"
        />
        <kbd className="pointer-events-none absolute right-2.5 hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.625rem] text-muted-foreground lg:block">
          ⌘K
        </kbd>
      </label>

      <div className="flex-1 md:hidden" />

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="size-4" />
          <span className="absolute right-2 top-2 size-2 rounded-full bg-primary ring-2 ring-card" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-10 gap-2 px-1.5" aria-label="Account menu">
              <Avatar name={user.name} size="sm" />
              <span className="hidden flex-col items-start leading-tight sm:flex">
                <span className="text-sm font-medium">{user.name}</span>
                <span className="text-[0.6875rem] text-muted-foreground">{user.role}</span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <span className="flex items-center gap-2.5">
                <Avatar name={user.name} size="md" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{user.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </span>
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/profile">
                <User /> Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings/security">
                <ShieldCheck /> Security &amp; 2FA
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/admin/users">
                <Settings /> Users &amp; roles
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="text-destructive focus:text-destructive">
              <SignOutButton className="flex w-full cursor-pointer items-center gap-2" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
