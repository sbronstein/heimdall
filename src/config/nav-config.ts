import { NavItem } from '@/types';

export const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    url: '/dashboard/overview',
    icon: 'dashboard',
    isActive: false,
    shortcut: ['d', 'd'],
    items: []
  },
  {
    title: 'Companies',
    url: '/dashboard/companies',
    icon: 'building',
    isActive: false,
    shortcut: ['c', 'c'],
    items: []
  },
  {
    title: 'Pipeline',
    url: '/dashboard/pipeline',
    icon: 'kanban',
    isActive: false,
    shortcut: ['p', 'p'],
    items: []
  },
  {
    title: 'Networking',
    url: '/dashboard/networking',
    icon: 'teams',
    isActive: false,
    shortcut: ['n', 'w'],
    items: []
  },
  {
    title: 'Job Leads',
    url: '/dashboard/job-leads',
    icon: 'target',
    isActive: false,
    shortcut: ['j', 'l'],
    items: []
  },
  {
    title: 'Outreach',
    url: '/dashboard/outreach',
    icon: 'mail',
    isActive: false,
    shortcut: ['o', 'u'],
    items: []
  },
  {
    title: 'Contacts',
    url: '/dashboard/contacts',
    icon: 'addressBook',
    isActive: false,
    shortcut: ['o', 'o'],
    items: []
  },
  {
    title: 'Tasks',
    url: '/dashboard/tasks',
    icon: 'checklist',
    isActive: false,
    shortcut: ['t', 't'],
    items: []
  },
  {
    title: 'Notes',
    url: '/dashboard/notes',
    icon: 'notebook',
    isActive: false,
    shortcut: ['n', 'n'],
    items: []
  },
  {
    title: 'Metrics',
    url: '/dashboard/metrics',
    icon: 'metrics',
    isActive: false,
    shortcut: ['m', 'e'],
    items: []
  },
  {
    title: 'Account',
    url: '#',
    icon: 'account',
    isActive: true,
    items: [
      {
        title: 'Profile',
        url: '/dashboard/profile',
        icon: 'profile',
        shortcut: ['m', 'm']
      },
      {
        title: 'Login',
        shortcut: ['l', 'l'],
        url: '/',
        icon: 'login'
      }
    ]
  }
];
