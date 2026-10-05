import { useForm } from '@tanstack/react-form';
import { remembered } from '../identity';
import { Button } from './Button';
import { CenteredSection } from './CenteredSection';
import { ErrorMessage } from './ErrorMessage';
import { Form } from './Form';
import { HomeLink } from './HomeLink';
import { TextField } from './TextField';

export function JoinRoom({
  title,
  error,
  onJoin,
}: {
  title: string;
  error: string;
  onJoin: (name: string, spectator: boolean) => void;
}) {
  const form = useForm({
    defaultValues: { name: remembered('name') },
    onSubmitMeta: { spectator: false },
    onSubmit: ({ value, meta }) => onJoin(value.name, meta.spectator),
  });

  return (
    <CenteredSection header={<HomeLink />}>
      <title>{`${title} | Planning Poker`}</title>
      <h1 className="text-3xl font-semibold tracking-tight wrap-anywhere select-text">
        Join {title}
      </h1>
      <p className="mt-2 leading-relaxed text-zinc-400 select-text">
        Choose a name so your team knows it's you.
      </p>
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          // Enter submits with the first button, so it joins to vote
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          void form.handleSubmit({
            spectator: submitter?.getAttribute('value') === 'spectator',
          });
        }}
      >
        <form.Field
          name="name"
          validators={{
            onSubmit: ({ value }) => (value.trim() ? undefined : 'Enter your name'),
          }}
        >
          {(field) => (
            <TextField
              id="name"
              label="Name"
              name={field.name}
              error={field.state.meta.errors[0]}
              autoComplete="given-name"
              autoFocus
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          )}
        </form.Field>
        <div className="flex flex-col gap-3">
          <Button>Join</Button>
          <p className="text-center text-sm text-zinc-400">
            or{' '}
            <button
              value="spectator"
              className="py-1 font-semibold text-indigo-400 hover:text-indigo-300"
            >
              watch as spectator
            </button>
          </p>
        </div>
        <ErrorMessage>{error}</ErrorMessage>
      </Form>
    </CenteredSection>
  );
}
