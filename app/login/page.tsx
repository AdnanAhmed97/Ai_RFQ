import { isDemoModeAvailable } from "@/lib/config/env";
import { env } from "@/lib/config/env";
import { ConnectAIForm } from "./connect-form";

/**
 * Login and BYOK setup (spec §11).
 *
 * "Continue as Procurement Buyer" is the whole of authentication in this
 * prototype. The substantive step on this screen is connecting a model
 * provider, which is what the rest of the product depends on.
 */
export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-10">
        <h1 className="text-2xl font-medium tracking-tight">RFx Intelligence</h1>
        <p className="text-secondary mt-2 text-balance">
          Turn messy vendor responses into defensible sourcing decisions.
        </p>
      </div>

      <ConnectAIForm
        model={env.ANTHROPIC_MODEL}
        demoModeAvailable={isDemoModeAvailable()}
      />
    </div>
  );
}
