import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Attachment uploads go through a Server Action, whose body defaults to a
      // 1 MB cap. Raise it to sit just above the 15 MB Zod cap in
      // src/lib/validation/attachment.ts so the transport limit and the
      // validation limit agree (otherwise large files 413 before validation).
      // NOTE: this raises the body limit for ALL server actions; each one still
      // authorizes + Zod-validates. The production path is presigned
      // direct-to-storage upload (companion to the S3 driver) so bytes never
      // transit the server action — see the Phase 7 report's known limitations.
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
