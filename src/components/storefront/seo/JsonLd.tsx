import React from "react";

export interface JsonLdProps {
  schema: Record<string, any> | Array<Record<string, any>>;
}

export function JsonLd({ schema }: JsonLdProps) {
  if (!schema) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
