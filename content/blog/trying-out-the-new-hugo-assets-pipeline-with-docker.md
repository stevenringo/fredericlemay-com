---
title: Trying out the new Hugo’s Assets Pipeline with Docker
draft: false
date: "2018-07-29"
lastmod:
featuredImage: img/blog/hugo_assets_pipeline_docker.jpg
blogURL: https://medium.com/@fredericlemay/trying-out-the-new-hugos-assets-pipeline-with-docker-61340cd3dfd2
---

[Hugo][linkHugo], a popular framework for building static websites, released an exciting feature few weeks ago: Assets Pipeline. In a nutshell, Hugo can compile your SCSS/SASS files, minify your assets, [and much more][linkHugoReleaseNotes].

I decided to give it a go in the process of rebuilding my new [3 Musketeers website][link3musketeers], hoping I can remove my [Gulp][linkGulp] file and simplify the build process.

<!--more-->

## Environment

My website development environment only relies on Make, Docker, and Compose, thus the reason why I tested Hugo's Assets Pipeline with Docker. When a change is done to master on [GitHub][link3musketeersGitHub], a build is triggered by [Travis CI][link3musketeersTravisCI] to build and deploy the website to [Netlify][linkNetlify].

## Testing Hugo Pipes with Docker

In order to use Hugo's Assets Pipeline, version 0.43, or higher, of Hugo is required. The following Dockerfile downloads Hugo binary from the releases page on GitHub:

```Dockerfile
FROM golang
WORKDIR /opt/hugo
ENV HUGO_VERSION 0.44
ENV HUGO_BIN_NAME hugo_${HUGO_VERSION}_Linux-64bit.tar.gz
ENV HUGO_BIN_URL https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/${HUGO_BIN_NAME}
RUN wget -qO- "${HUGO_BIN_URL}" | tar xz
ENV PATH "/opt/hugo:${PATH}"
CMD ["hugo", "version"]
```

The second step is to build the image and test it.

```bash
# build image
$ docker build --tag hugo .
# run the image
$ docker run --rm hugo
Hugo Static Site Generator v0.44 linux/amd64 BuildDate: 2018-07-13T06:03:11Z
```

Great! Hugo is installed and working. Assets files must be stored in the [assets folder][linkHugoAssetDirectory] and I added the following Hugo pipes lines in the head section of the web page.

```html
<head>
...
{{ $style := resources.Get "css/mystyle.scss" | toCSS | postCSS | minify | fingerprint }}
<link rel="stylesheet" href="{{ $style.Permalink }}">
...
</head>
```

The code above gets the asset file `assets/css/mystyle.scss` and applies some transformations.

Simple, right?

Unfortunately, running `hugo` throws the following error:

```bash
bash-4.4# hugo
Building sites … ERROR 2018/07/22 01:26:54 error: failed to transform resource: TOCSS:failed to transform "css/mystyle.scss" (text/x-scss): this feature is not available inyour current Hugo version
```

What happened? The latest version of Hugo should support `toCSS` , no? After some time digging, _I am new to Hugo_, I found this interesting comment in [Hugo's source code][linkHugoToCSS]:

```go
// Used in tests. This feature requires Hugo to be built with the extended tag.
func Supports() bool {
    return true
}
```

It turns out that Hugo needs to be compiled with the [tag extended][linkHugoDiscourse] for SCSS/SASS compilation feature to be included. An extended binary version is also available in the [releases page][linkHugoRelease]: `hugo_extended_0.44_Linux-64bit.tar.gz`.

Fast forward, after installing the extended version, NodeJS with the modules `postcss-cli` and `autoprefixer` for handling postCSS transformation, I got the assets pipeline working, YAY!

Done? Almost. The Docker image size is 962MB…which is pretty heavy given Travis CI downloads it every time a commit is done to master for building and deploying the latest changes.

## Downsizing the image

If you have used Docker before, you would know that trying to reduce the image size is a good thing. So I decided to replace the base image `golang` with `alpine`.

```Dockerfile
FROM alpine:3.8
RUN apk --update add bash make && rm -rf /var/cache/apk/*
WORKDIR /opt/hugo
ENV HUGO_VERSION 0.44
ENV HUGO_BIN_NAME hugo_extended_${HUGO_VERSION}_Linux-64bit.tar.gz
ENV HUGO_BIN_URL https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/${HUGO_BIN_NAME}
RUN wget -qO- "${HUGO_BIN_URL}" | tar xz
ENV PATH "/opt/hugo:${PATH}"
CMD ["hugo","version"]
```

Pretty straight forward here…until we test the image.

```bash
# build the image
$ docker build --tag hugo .
# test the image
$ docker run --rm hugo
standard_init_linux.go:190: exec user process caused "no such file or directory"
```

Wait! Hugo does not exist? what?!

## Debugging time

Often when troubleshooting a Docker image, I simply create an empty image and manually run the commands inside. The Dockerfile looks like the this:

```Dockerfile
FROM alpine:3.8
RUN apk --update --no-cache add bash make
```

Then I build and start the container in interactive mode `docker build --tag hugo . && docker run --rm -it hugo bash`. After manually installing the extended version of Hugo, I faced this error:

```bash
bash-4.4# hugo version
bash: /opt/hugo/hugo: No such file or directory
# Hugo does exist
bash-4.4# ls /opt/hugo/
LICENSE  README.md  hugo
```

> Interestingly, installing the non-extended version of Hugo works!

Golang binaries are being built for specific operating system. For instance, binaries that are compiled for windows would not work on Linux. Let's look at the file `hugo` using a linux tool `file` and compare it with the system if it is compatible.

```bash
# adding the tool file
bash-4.4# apk add file
bash-4.4# file hugo
hugo: ELF 64-bit LSB executable, x86-64, version 1 (GNU/Linux), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, for GNU/Linux 2.6.32, BuildID[sha1]=7621f50844b0494c9fa7846a9e1366892aacf6c8, stripped
bash-4.4# uname -a
Linux 9020df8730ea 4.9.87-linuxkit-aufs #1 SMP Wed Mar 14 15:12:16 UTC 2018 x86_64 Linux
```

Both are `x86-64 Linux` and what's interesting here is the dynamic linking part. Running `file` command on the standard version of Hugo gives this output:

```bash
/opt/hugo/hugo: ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
```

The extended version of Hugo depends on external libraries, but which ones? Command `ldd` to the rescue!

```bash
bash-4.4# ldd /opt/hugo/hugo
        /lib64/ld-linux-x86-64.so.2 (0x7fc95bed9000)
        libpthread.so.0 => /lib64/ld-linux-x86-64.so.2 (0x7fc95bed9000)
Error loading shared library libstdc++.so.6: No such file or directory (needed by /opt/hugo/hugo)
        libdl.so.2 => /lib64/ld-linux-x86-64.so.2 (0x7fc95bed9000)
        libm.so.6 => /lib64/ld-linux-x86-64.so.2 (0x7fc95bed9000)
Error loading shared library libgcc_s.so.1: No such file or directory (needed by /opt/hugo/hugo)
        libc.so.6 => /lib64/ld-linux-x86-64.so.2 (0x7fc95bed9000)
Error relocating /opt/hugo/hugo: _Znam: symbol not found
Error relocating /opt/hugo/hugo: _ZNSo3putEc: symbol not found
Error relocating /opt/hugo/hugo: _ZNKSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEE7compareERKS4_: symbol not found
Error relocating /opt/hugo/hugo: _ZSt29_Rb_tree_insert_and_rebalancebPSt18_Rb_tree_node_baseS0_RS_: symbol not found
Error relocating /opt/hugo/hugo: _ZSt11_Hash_bytesPKvmm: symbol not found
...
```

Not pretty at first, but hugo needs some c/c++ libraries that can be installed with `apk add build-base`.

```bash
bash-4.4# ldd /opt/hugo/hugo
        /lib64/ld-linux-x86-64.so.2 (0x7f4cc4d38000)
        libpthread.so.0 => /lib64/ld-linux-x86-64.so.2 (0x7f4cc4d38000)
        libstdc++.so.6 => /usr/lib/libstdc++.so.6 (0x7f4cc49e6000)
        libdl.so.2 => /lib64/ld-linux-x86-64.so.2 (0x7f4cc4d38000)
        libm.so.6 => /lib64/ld-linux-x86-64.so.2 (0x7f4cc4d38000)
        libgcc_s.so.1 => /usr/lib/libgcc_s.so.1 (0x7f4cc47d4000)
        libc.so.6 => /lib64/ld-linux-x86-64.so.2 (0x7f4cc4d38000)
```

Prettier now, but I noticed that I don't have the folder `/lib64`.

```bash
bash-4.4# ls /lib64/ld-linux-x86-64.so.2
ls: /lib64/ld-linux-x86-64.so.2: No such file or directory
```

Looking up the file `/lib64/ld-linux-x86-64.so.2` on the [Alpine Linux Packages website][linkAlpinePackages], I found it to be part of `libc6-compat` package.

```bash
bash-4.4# apk add libc6-compat
bash-4.4# hugo version
Hugo Static Site Generator v0.44/extended linux/amd64 BuildDate: 2018-07-13T06:27:00Z
```

Finally! Hugo works!

Fast forward again, after installing NodeJS and few modules, I could run `hugo` successfully. And the image size was 266MB, 4 times smaller!

> You know the feeling when you fixed something after hours of digging? All this rush of energy motivated me to start writing this blog post.
> Unfortunately this great feeling evaporated quickly after I saw a [red build on TravisCI][link3musketeersTravisCIBuildFailed].

Segmentation fault?! Ohh noes! Rebuilding it locally again showed the same error.

```bash
bash-4.4# hugo
Building sites … Segmentation fault
```

Moments later, I stopped digging, reverted my changes back to use `golang` Docker image, and everything worked again.

> At that point I was wondering if I should keep writing. After all, I failed, no?! Maybe at optimising, but the findings about Hugo and dynamic linking were worth sharing.

## Conclusion

I achieved my main goal: replacing my Gulp file with Hugo's new pipes feature. There is probably an explanation regarding the segmentation fault and, maybe, I will resume later. For now, Hugo's assets pipeline works and the new [3 Musketeers site][link3musketeers] is up.

[linkHugo]: https//gohugo.io
[linkHugoReleaseNotes]: https://gohugo.io/news/0.43-relnotes/
[link3musketeers]: https://3musketeers.io
[linkGulp]: https://gulpjs.com/
[link3musketeersGitHub]: https://github.com/flemay/3musketeers
[link3musketeersTravisCI]: https://travis-ci.org/flemay/3musketeers
[linkNetlify]: https://www.netlify.com
[linkHugoAssetDirectory]: https://gohugo.io/hugo-pipes/introduction/#asset-directory
[linkHugoToCSS]: https://github.com/gohugoio/hugo/blob/166483fe1227b0c59c6b4d88cfdfaf7d7b0d79c5/resource/tocss/scss/tocss.go#L33
[linkHugoDiscourse]:https://discourse.gohugo.io/t/hugo-0-43-released/12814
[linkHugoRelease]: https://github.com/gohugoio/hugo/releases
[linkAlpinePackages]: https://pkgs.alpinelinux.org/contents?file=ld-linux-x86-64.so.2&path=&name=&branch=&repo=&arch=
[link3musketeersTravisCIBuildFailed]: https://travis-ci.org/flemay/3musketeers/builds/406601928