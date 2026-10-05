import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { useState } from 'react';
import { Button } from '../components/Button';
import { CenteredSection } from '../components/CenteredSection';
import { ErrorMessage } from '../components/ErrorMessage';
import { Form } from '../components/Form';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';

export const Route = createFileRoute('/')({ component: Home });

// The server's deck names, with the cards each one holds
const decks = [
  {
    value: 'fibonacci',
    label: 'Modified Fibonacci',
    description: '0, 1, 2, 3, 5, 8, 13, 20, 40, 100, ?, ☕',
  },
  { value: 'tshirt', label: 'T-shirt sizes', description: 'XS, S, M, L, XL, XXL, ?, ☕' },
];

function Home() {
  return (
    <CenteredSection>
      {/* Prose stays selectable here, unlike the app's controls. */}
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
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(result.error || 'Could not create room');
        }

        await navigate({ to: '/$code', params: { code: result.code } });
      } catch (cause) {
        // Form errors end without a full stop, the server's included
        setError(
          cause instanceof Error ? cause.message.replace(/\.$/, '') : 'Could not create room',
        );
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
          onSubmit: ({ value }) => (value.trim() ? undefined : 'Enter a room title'),
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
