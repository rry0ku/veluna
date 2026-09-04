use std::io::{BufRead, BufReader, Write};
use std::thread;

use interprocess::local_socket::traits::{ListenerExt as _, Stream as _};
use interprocess::local_socket::{GenericNamespaced, ListenerOptions, Stream, ToNsName};
use tokio::sync::mpsc::UnboundedSender;

const SOCKET: &str = match cfg!(debug_assertions) {
    true => "veluna-dev.sock",
    false => "veluna.sock",
};

pub enum Instance {
    First,
    Running,
}

pub fn claim(link: Option<&str>, sender: UnboundedSender<String>) -> Instance {
    let name = match SOCKET.to_ns_name::<GenericNamespaced>() {
        Ok(name) => name,
        Err(error) => {
            log::warn!("single: cannot name the instance socket: {error:#}");
            return Instance::First;
        }
    };

    let listener = match ListenerOptions::new().name(name.clone()).create_sync() {
        Ok(listener) => listener,
        Err(_) if hand_over(name, link) => return Instance::Running,
        Err(error) => {
            log::warn!("single: cannot own the instance socket: {error:#}");
            return Instance::First;
        }
    };

    thread::spawn(move || {
        for connection in listener.incoming() {
            let Ok(connection) = connection else {
                continue;
            };
            let mut line = String::new();
            if BufReader::new(connection).read_line(&mut line).is_err() {
                continue;
            }
            if sender.send(line.trim().to_owned()).is_err() {
                break;
            }
        }
    });

    Instance::First
}

fn hand_over(name: interprocess::local_socket::Name<'_>, link: Option<&str>) -> bool {
    let Ok(mut stream) = Stream::connect(name) else {
        return false;
    };
    writeln!(stream, "{}", link.unwrap_or_default()).is_ok()
}
