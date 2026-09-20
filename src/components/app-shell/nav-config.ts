import type { Capability } from '@/server/auth/permissions';
import type { Dictionary } from '@/i18n';

export type NavItem = {
  href: string;
  labelKey: keyof Dictionary['nav'];
  icon: string;
  /** Hidden entirely when the member lacks this capability. */
  capability?: Capability;
  exact?: boolean;
};

export type NavGroup = {
  labelKey: keyof Dictionary['nav'];
  items: NavItem[];
};

/**
 * Single definition of the authenticated navigation. Icons are named here and
 * resolved in the client component, so this file stays serialisable and can be
 * imported by server components.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: 'groupCreate',
    items: [
      { href: '/dashboard', labelKey: 'dashboard', icon: 'LayoutDashboard', exact: true },
      { href: '/campaigns', labelKey: 'campaigns', icon: 'Megaphone' },
      { href: '/products', labelKey: 'products', icon: 'Package' },
      { href: '/brands', labelKey: 'brands', icon: 'Palette' },
      { href: '/templates', labelKey: 'templates', icon: 'LayoutTemplate' },
    ],
  },
  {
    labelKey: 'groupDistribute',
    items: [
      { href: '/content', labelKey: 'contentLibrary', icon: 'FileText' },
      { href: '/media', labelKey: 'mediaLibrary', icon: 'Images' },
      { href: '/calendar', labelKey: 'calendar', icon: 'CalendarDays' },
      { href: '/social', labelKey: 'socialAccounts', icon: 'Share2' },
    ],
  },
  {
    labelKey: 'groupMeasure',
    items: [{ href: '/analytics', labelKey: 'analytics', icon: 'BarChart3', capability: 'analytics:read' }],
  },
  {
    labelKey: 'groupManage',
    items: [
      { href: '/team', labelKey: 'team', icon: 'Users', capability: 'team:manage' },
      { href: '/billing', labelKey: 'billing', icon: 'CreditCard', capability: 'billing:manage' },
      { href: '/settings', labelKey: 'settings', icon: 'Settings' },
    ],
  },
];
