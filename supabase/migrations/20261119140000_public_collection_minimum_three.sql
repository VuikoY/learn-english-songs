create or replace function public.enforce_public_collection_minimum()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_public and (
    select count(*) from public.collection_items item where item.collection_id = new.id
  ) < 3 then
    raise exception 'PUBLIC_COLLECTION_REQUIRES_THREE_ITEMS' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_public_collection_item_minimum()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform 1
  from public.word_collections collection
  where collection.id = old.collection_id and collection.is_public = true
  for update;

  if found and (
    select count(*) from public.collection_items item where item.collection_id = old.collection_id
  ) <= 3 then
    raise exception 'PUBLIC_COLLECTION_REQUIRES_THREE_ITEMS' using errcode = '23514';
  end if;
  return old;
end;
$$;
