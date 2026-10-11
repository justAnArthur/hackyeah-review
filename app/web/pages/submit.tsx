import { Layout, PageHeader, Panel } from "@/components/layout"
import { Button } from "@/components/ui/button"

// the event ended and the form closed on 11 October 2026; the page stays so links already shared land on an explanation
export const SubmitPage = () => (
  <Layout current="/submit">
    <PageHeader eyebrow="HackYeah 2026 · Council review" title="Submissions are closed">
      HackYeah 2026 ended on 4 October, and the form closed on 11 October once the queue had worked through everything teams sent.
      The reviews stay online: community submissions are listed under their task on the results page, and the link a team got when
      sending its project still opens that review.
    </PageHeader>
    <Panel>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" nativeButton={false} render={<a href="/" />}>
          See the results
        </Button>
        <span className="text-xs text-muted-foreground">
          Every finalist with public code and every community submission keeps its council review.
        </span>
      </div>
    </Panel>
  </Layout>
)
