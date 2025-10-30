export type PublicGlobeNode = {
  id: string;
  name: string;
  countryCode: string;
  createdAt: string;
  boats: number;
};

export type PublicGlobeLink = {
  source: string;
  target: string;
};

export type PublicGlobeSnapshot = {
  generatedAt: string;
  nodes: PublicGlobeNode[];
  links: PublicGlobeLink[];
};


