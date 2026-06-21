import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type {
  Contact,
  OutreachCampaign,
  OutreachEmail
} from '@/lib/domain/types';

interface CampaignReviewPageProps {
  campaign: OutreachCampaign;
  emails: { email: OutreachEmail; contact: Contact | null }[];
}

/**
 * Minimal placeholder review page (D-13).
 * Shows campaign header + the list of added contacts at pending status.
 * Phase 15 enriches this route with per-email edit/approve/regenerate UI.
 */
export function CampaignReviewPage({
  campaign,
  emails
}: CampaignReviewPageProps) {
  // Derive per-status counts from the emails array for the header summary
  const statusCounts = emails.reduce<Record<string, number>>(
    (acc, { email }) => {
      acc[email.status] = (acc[email.status] ?? 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <div className='mx-auto max-w-3xl space-y-6'>
      {/* Campaign header card */}
      <Card>
        <CardHeader>
          <CardTitle>{campaign.name}</CardTitle>
          {campaign.goalInstruction && (
            <p className='text-muted-foreground text-sm'>
              {campaign.goalInstruction}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className='flex flex-wrap gap-3 text-sm'>
            <span>
              <span className='font-medium'>{emails.length}</span> contact
              {emails.length !== 1 ? 's' : ''} added
            </span>
            {Object.entries(statusCounts).map(([status, count]) => (
              <Badge key={status} variant='outline' className='text-xs'>
                {count} {status.replace(/_/g, ' ')}
              </Badge>
            ))}
          </div>

          <p className='text-muted-foreground mt-4 text-xs'>
            Email review &amp; approval arrives in the next update (Phase 15).
          </p>
        </CardContent>
      </Card>

      {/* Added contacts list */}
      {emails.length > 0 && (
        <div className='rounded-lg border'>
          <div className='bg-muted/40 border-b px-4 py-2 text-sm font-medium'>
            Added Contacts
          </div>
          <ul className='divide-y'>
            {emails.map(({ email, contact }) => (
              <li
                key={email.id}
                className='flex items-center justify-between px-4 py-3 text-sm'
              >
                <span>
                  {contact ? (
                    <>
                      <span className='font-medium'>
                        {contact.firstName} {contact.lastName}
                      </span>
                      {contact.currentCompany && (
                        <span className='text-muted-foreground ml-1 text-xs'>
                          @ {contact.currentCompany}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className='text-muted-foreground italic'>
                      Contact removed
                    </span>
                  )}
                </span>
                <Badge variant='outline' className='text-xs capitalize'>
                  {email.status.replace(/_/g, ' ')}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {emails.length === 0 && (
        <Card>
          <CardContent className='pt-6 text-center'>
            <p className='text-muted-foreground text-sm'>
              No contacts have been added to this campaign yet.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
