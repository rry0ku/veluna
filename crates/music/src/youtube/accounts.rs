use std::collections::HashSet;

use ytmusic::{Profile, YtMusic};

use crate::AccountChoice;

const LIMIT: usize = 8;

pub struct Account {
    pub index: usize,
    pub profile: Profile,
}

impl Account {
    pub fn choice(&self) -> AccountChoice {
        AccountChoice {
            id: self.index.to_string(),
            name: self.profile.name.clone(),
            detail: self.profile.email.clone(),
        }
    }
}

pub async fn list(cookies: &str) -> Vec<Account> {
    let mut found = Vec::new();
    let mut seen = HashSet::new();
    for index in 0..LIMIT {
        let Ok(profile) = YtMusic::with_cookies(cookies)
            .as_user(index)
            .profile()
            .await
        else {
            break;
        };
        if !seen.insert(identity(&profile)) {
            break;
        }
        found.push(Account { index, profile });
    }
    found
}

fn identity(profile: &Profile) -> String {
    profile
        .email
        .clone()
        .unwrap_or_else(|| profile.name.clone())
}
