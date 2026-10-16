import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Button } from '../components/Button';
import { CenteredSection } from '../components/CenteredSection';
import { ErrorMessage } from '../components/ErrorMessage';
import { Form } from '../components/Form';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';
import { CreatedRoomSchema, failure } from '../api';
import { decks } from '../decks';
import { maxTitleLength, validLabel } from '../labels';

export const Route = createFileRoute('/')({ component: Home });

function Home() {
  return (
    <CenteredSection>
      <h1 className="text-3xl font-semibold tracking-tight select-text">Planning Poker</h1>
      <p className="mt-2 leading-relaxed text-zinc-400 select-text">
        Create a room, share the link, estimate together.
      </p>
      <CreateRoomForm />
    </CenteredSection>
  );
}

function CreateRoomForm() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const form = useForm({
    defaultValues: { title: '', deck: 'fibonacci' },
    onSubmit: async ({ value }) => {
      setError('');

      try {
        const response = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(value),
        });
        const body: unknown = await response.json().catch(() => null);
        const created = response.ok ? CreatedRoomSchema.safeParse(body).data : undefined;
        if (!created) {
          throw new Error(failure(body, 'Could not create room'));
        }

        await navigate({ to: '/$code', params: { code: created.code } });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not create room');
      }
    },
  });

  return (
    <Form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Field
        name="title"
        validators={{
          onSubmit: ({ value }) => {
            if (!value.trim()) {
              return 'Enter a room title';
            }

            return validLabel(value, maxTitleLength)
              ? undefined
              : `Use 1–${maxTitleLength} characters without control characters`;
          },
        }}
      >
        {(field) => (
          <TextField
            id="title"
            label="Room title"
            name={field.name}
            error={field.state.meta.errors[0]}
            value={field.state.value}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            placeholder="e.g. Friday sprint planning"
            autoComplete="off"
          />
        )}
      </form.Field>
      <form.Field name="deck">
        {(field) => (
          <SelectField
            label="Estimation deck"
            items={decks}
            value={field.state.value}
            onValueChange={field.handleChange}
          />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(busy) => <Button>{busy ? 'Creating…' : 'Create room'}</Button>}
      </form.Subscribe>
      <ErrorMessage>{error}</ErrorMessage>
    </Form>
  );
}
