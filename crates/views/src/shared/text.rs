use std::cmp::Ordering;

pub(crate) fn holds(haystack: &str, needle: &str) -> bool {
    if needle.is_empty() {
        return true;
    }

    haystack
        .char_indices()
        .any(|(at, _)| starts(&haystack[at..], needle))
}

pub(crate) fn folded(left: &str, right: &str) -> Ordering {
    let mut left = left.chars().flat_map(char::to_lowercase);
    let mut right = right.chars().flat_map(char::to_lowercase);

    loop {
        match (left.next(), right.next()) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(here), Some(there)) if here == there => continue,
            (Some(here), Some(there)) => return here.cmp(&there),
        }
    }
}

fn starts(haystack: &str, needle: &str) -> bool {
    let mut lowered = haystack.chars().flat_map(char::to_lowercase);
    let mut wanted = needle.chars();

    loop {
        match (lowered.next(), wanted.next()) {
            (_, None) => return true,
            (Some(here), Some(there)) if here == there => continue,
            _ => return false,
        }
    }
}
