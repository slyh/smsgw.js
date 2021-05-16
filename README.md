**This project is not in development and considered to be unstable for production.**

smsgw.js is an SMS gateway which allows applications to send and receive SMS messages with a set of HTTP API. The project is only tested with Huawei E3372s but generally should work with modems that support GSM AT commands with serial interface.

## Known issues
* The serial port locks up after a period of usage.

## API

### Send messages

Send a GET request to `/` with queries listed below.

Example: `/?action=send&device=E3372_1&to=85261234567&message=test`

Name | Value
-----|------
action | `send`
device | Name of the GSM modem in `config.js`.
to | Recipient's phone number.
message | Content of the SMS message.

### Retrieve status of modems

Send a GET request to `/` with queries listed below.

Example: `/?action=status&device=E3372_1`

Name | Value
-----|------
action | `status`
device | Name of the GSM modem in `config.js`. (optional)

### Reset a modem

Send a GET request to `/` with queries listed below.

Example: `/?action=reset&device=E3372_1`

Name | Value
-----|------
action | `reset`
device | Name of the GSM modem in `config.js`.

### Send USSD codes

Send a GET request to `/` with queries listed below.

Example: `/?action=ussd&device=E3372_1&command=*#1234#`

Name | Value
-----|------
action | `ussd`
device | Name of the GSM modem in `config.js`.
command | The USSD code you could like to send.

### Get unread messages

Send a GET request to `/` with queries listed below.

Example: `/?action=readall&device=E3372_1`

Name | Value
-----|------
action | `readall`
device | Name of the GSM modem in `config.js`.

### Callback for incoming messages

Set the callback URL in `config.js`.

It should expect a POST request with the following form data.

Name | Value
-----|------
device | Modem that received this message.
iccid | ICCID of the SIM card inside this modem.
sender | Sender of this message.
message | Content of the SMS message.