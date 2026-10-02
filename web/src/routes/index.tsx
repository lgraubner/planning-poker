import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Button } from '../components/Button';
import { CenteredSection } from '../components/CenteredSection';
import { ErrorMessage } from '../components/ErrorMessage';
import { Form } from '../components/Form';
import { PageIntro } from '../components/PageIntro';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';

export const Route = createFileRoute('/')({ component: Home });

// The server's deck names, with the cards each one holds.
const decks = [
  { value: 'fibonacci', label: 'Fibonacci: 0, 1, 2, 3, 5, 8, 13, 21' },
  { value: 'tshirt', label: 'T-shirt sizes: XS, S, M, L, XL, XXL' },
];

function Home() {
  return (
    <CenteredSection>
      <PageIntro
        eyebrow="A little less guessing"
        title={
          <>
            Different perspectives.
            <br />
            One shared estimate.
          </>
        }
        description={
          <>
            Pick your estimate privately, then reveal together.
            <br />
            Create a room and share the link with your team.
          </>
        }
      />
      <CreateRoomForm />
      <p className="mt-4 text-sm text-zinc-400">No account needed. Rooms are temporary.</p>
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
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not create room.');
        await navigate({ to: '/$code', params: { code: result.code } });
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not create room.');
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
          onSubmit: ({ value }) => (value.trim() ? undefined : 'Enter a room title.'),
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
