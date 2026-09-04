use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    fonts();

    #[cfg(windows)]
    {
        let icon = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../assets/windows/veluna.ico"
        );
        println!("cargo:rerun-if-changed={icon}");
        let mut resource = winresource::WindowsResource::new();
        resource.set_icon(icon);
        resource.set("ProductName", "Veluna");
        resource.set("FileDescription", "Veluna");
        if let Err(error) = resource.compile() {
            println!("cargo:warning=cannot embed the windows icon: {error}");
        }
    }
}

fn fonts() {
    let assets = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("cargo names the crate"))
        .join("../../assets/fonts");
    let assets = assets.canonicalize().expect("cannot find assets/fonts");

    let faces = embed::folder(&assets, "ttf");
    let embedded = embed::embedded(&faces, |item| format!("fonts/{}.ttf", item.name));
    let source = format!("const FONTS: &[(&str, &[u8])] = {embedded};\n");

    let out = PathBuf::from(env::var("OUT_DIR").expect("cargo sets the output")).join("fonts.rs");
    fs::write(&out, source).expect("cannot write the font registry");
    println!("cargo:rerun-if-changed=build.rs");
}
