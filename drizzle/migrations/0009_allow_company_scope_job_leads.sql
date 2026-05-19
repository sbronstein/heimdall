-- Allow company-scope job leads: drop NOT NULL on linkedin_job_url so synthetic leads created from a company name/URL can exist
ALTER TABLE "job_leads" ALTER COLUMN "linkedin_job_url" DROP NOT NULL;