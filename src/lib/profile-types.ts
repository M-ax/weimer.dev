export interface Capability {
  title: string;
  description: string;
  technologies: string[];
}

export interface DeveloperProfile {
  name: string;
  role: string;
  availability: string;
  introduction: string;
  mission: string;
  capabilities: Capability[];
  perspective: string;
  contact: string;
}