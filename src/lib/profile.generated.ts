import type { DeveloperProfile } from './profile-types';

export const profile: DeveloperProfile = {
  name: 'Max Weimer',
  role: 'Software engineer for complex systems',
  availability: 'Available for thoughtful engineering conversations',
  introduction:
    'I build durable software where the details matter—from .NET applications that serve real teams to manufacturing systems that have to keep pace with the fab.',
  mission:
    'My work sits at the meeting point of production software, clear interfaces, and the industrial processes behind modern semiconductors. I enjoy turning intricate requirements into calm, dependable tools.',
  capabilities: [
    {
      title: 'C# & .NET',
      description:
        'Practical experience across .NET Framework and modern .NET Core, with an emphasis on maintainable application architecture and dependable integration work.',
      technologies: ['C#', '.NET Framework', '.NET Core', 'APIs'],
    },
    {
      title: 'Blazor experiences',
      description:
        'Interactive interfaces built with the .NET ecosystem in mind—designed to make operational workflows feel straightforward instead of fragile.',
      technologies: ['Blazor', 'Razor', 'Web UI', 'UX'],
    },
    {
      title: 'Semiconductor systems',
      description:
        'Domain perspective in semiconductor manufacturing and SEMI standards, connecting production realities with the software that supports them.',
      technologies: ['Semiconductor manufacturing', 'SEMI standards', 'Automation', 'Integration'],
    },
  ],
  perspective:
    'The best engineering respects the system around it. I bring curiosity to the domain, precision to the implementation, and a bias toward software people can confidently operate years from now.',
  contact: 'Let’s talk about the systems you are making more capable.',
};