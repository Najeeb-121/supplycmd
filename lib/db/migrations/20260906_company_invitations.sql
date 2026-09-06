BEGIN;

CREATE TABLE company_invitations (
  id serial PRIMARY KEY,
  company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_by_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT company_invitations_token_hash_unique
    UNIQUE (token_hash),

  CONSTRAINT company_invitations_company_id_email_unique
    UNIQUE (company_id, email),

  CONSTRAINT company_invitations_role_check
    CHECK (role IN ('admin', 'member'))
);

COMMIT;
