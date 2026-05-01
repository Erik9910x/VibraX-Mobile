'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Library, Heart, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/app', icon: Home, label: 'Home' },
  { href: '/app/search', icon: Search, label: 'Search' },
  { href: '/app/library', icon: Library, label: 'Library' },
  { href: '/app/favorites', icon: Heart, label: 'Favorites' },
  { href: '/app/profile', icon: User, label: 'Profile' },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0A1128]/90 backdrop-blur-xl border-t border-white/[0.04] px-2 pb-safe pt-2 flex items-center justify-around h-[72px]">
      {navItems.map((item) => {
        const isActive = item.href === '/app' 
          ? pathname === '/app'
          : pathname?.startsWith(item.href);
        
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center justify-center w-full h-full gap-1 transition-all',
              isActive ? 'text-[#00F0FF]' : 'text-white/50 hover:text-white/80'
            )}
          >
            <item.icon className={cn('w-5 h-5', isActive && 'drop-shadow-[0_0_8px_rgba(0,240,255,0.5)]')} />
            <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
